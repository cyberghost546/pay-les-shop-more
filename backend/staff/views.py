"""The staff dashboard API, mounted at /api/staff/.

Everything here is behind IsStaff. The customer-facing API in accounts/ and
enquiries/ is scoped to the caller's own rows; these views are the deliberate
exception, so the permission class is the whole security story and is applied
once, on a shared base class, rather than remembered per view.
"""

import re
from datetime import timedelta

from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.db.models.functions import TruncDate
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.emails import send_account_invite
from accounts.events import record_event
from accounts.views import ShipmentChangeRefused
from accounts.models import (
    InvalidShipmentTransition,
    Package,
    PackageDocument,
    PackageEvent,
    ShipmentLocked,
)
from bookings.models import Booking
from bookings.serializers import StaffBookingSerializer
from enquiries.models import ContactMessage, QuoteRequest
from invoicing.errors import InvoiceAlreadyExists
from invoicing.models import InvalidInvoiceTransition, Invoice
from invoicing.pdf import invoice_number
from invoicing.serializers import (
    InvoiceCreateSerializer,
    InvoiceDocumentSerializer,
    InvoiceRejectSerializer,
    StaffInvoiceSerializer,
)
from invoicing.services import ensure_invoice_for_package
from notifications.services import notify_shipment_status

from .permissions import IsStaff
from .serializers import (
    StaffAddressWriteSerializer,
    StaffContactMessageSerializer,
    StaffCustomerCreateSerializer,
    StaffCustomerSerializer,
    StaffPackageSerializer,
    StaffQuoteRequestSerializer,
    StaffRoleSerializer,
)

User = get_user_model()

# How far back "recent" reaches on the overview, and what the range picker
# above the chart offers. An allow-list rather than any number the caller
# sends: ?days=100000 is one query that reads the whole table.
RECENT_DAYS = 30
ALLOWED_RANGES = (7, 30, 90)

# Rows in each of the overview's activity lists.
RECENT_LIMIT = 5


def counts_by(queryset, field):
    """`{value: count}` for one column, in a single grouped query.

    A dict comprehension over the choices would run one COUNT per status;
    this runs one for the whole table.
    """
    rows = queryset.values(field).annotate(total=Count("id"))
    return {row[field]: row["total"] for row in rows}


def counts_per_day(queryset, since):
    """`{date: count}` of rows created on each day, in one grouped query.

    The database does the grouping. Pulling the rows out and counting them in
    Python would work for a demo database and stop working for a real one.
    """
    rows = (
        queryset.filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Count("id"))
    )
    return {row["day"]: row["total"] for row in rows}


def previous_count(queryset, field, since, days):
    """How many rows landed in the period immediately before this one.

    What makes the overview's arrows mean something. "32 quotes" says nothing
    on its own; "32, up from 24" is the sentence somebody actually wants, and
    it has to be measured rather than guessed — a delta invented in the
    browser from a single number is a decoration, not a figure.

    The window is the same length as the current one and ends where it begins,
    so the two are comparable: 30 days against the 30 before them.
    """
    started = since - timedelta(days=days)
    return queryset.filter(
        **{f"{field}__gte": started, f"{field}__lt": since}
    ).count()


def trend(queryset, field, since, days):
    """`{"current": n, "previous": n}` for one metric, for the arrow above it.

    The percentage is left to the caller that displays it. A change from 0 to
    3 has no percentage — it is "3 where there were none" — and deciding that
    in the browser, where the wording lives, beats sending an infinity here.
    """
    return {
        "current": queryset.filter(**{f"{field}__gte": since}).count(),
        "previous": previous_count(queryset, field, since, days),
    }


def daily_series(since, days, **querysets):
    """One row per day, including the days on which nothing happened.

    Built from the calendar rather than from the rows that exist, so a quiet
    Tuesday is a zero on the chart instead of a gap the line skips over.
    """
    per_day = {name: counts_per_day(qs, since) for name, qs in querysets.items()}
    start = since.date()

    return [
        {
            "date": (day := start + timedelta(days=offset)).isoformat(),
            **{name: counts.get(day, 0) for name, counts in per_day.items()},
        }
        for offset in range(days)
    ]


class StaffViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """List, read and update — never create or destroy.

    Nothing in the back office should be able to delete a customer's
    submission or a shipment record: staff mark things handled or move them
    along, and the row stays as evidence of what happened.

    Adds the three query parameters every list here needs:

        ?search=      substring match across `search_fields`
        ?<filter>=    exact match on a column named in `filter_fields`
        ?ordering=    one of `ordering_fields`, `-` for descending

    Hand-rolled rather than pulling in django-filter: it is three parameters
    against an allow-list, and an allow-list is what keeps `?ordering=` from
    becoming a way to sort by, and so probe, a password hash.
    """

    permission_classes = [IsStaff]

    search_fields = ()
    filter_fields = ()
    ordering_fields = ()

    def filter_queryset(self, queryset):
        params = self.request.query_params

        for field in self.filter_fields:
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})

        search = params.get("search", "").strip()
        if search and self.search_fields:
            matches = Q()
            for field in self.search_fields:
                matches |= Q(**{f"{field}__icontains": search})
            queryset = queryset.filter(matches)

        ordering = params.get("ordering", "").strip()
        if ordering.lstrip("-") in self.ordering_fields:
            queryset = queryset.order_by(ordering)

        return queryset


class QuoteRequestViewSet(StaffViewSet):
    """Quote requests from the destination pages."""

    serializer_class = StaffQuoteRequestSerializer
    queryset = QuoteRequest.objects.all()

    search_fields = ("first_name", "last_name", "email", "message", "destination")
    filter_fields = ("status", "destination")
    ordering_fields = ("created_at", "updated_at", "status", "destination")

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """Stream the attachment a visitor sent with their quote request.

        The same arrangement as the invoice routes, and here for the same two
        reasons. The link the dashboard used to get was the file's MEDIA_URL,
        which Django serves only while DEBUG is on — so opening an attachment
        worked locally and answered 404 on the deployed site. And publishing
        MEDIA_ROOT to make it work would have made every attachment fetchable
        by anyone who could guess a name.

        So the file is served here, where IsStaff has already been checked by
        DRF. Nothing narrows it further: staff may read every quote request,
        which is the job.

        as_attachment, and the content type is not guessed. This is the one
        kind of file on the site that arrives from a stranger, so it is handed
        to the browser as an opaque download rather than as something to
        render — a rendered attachment is a stored-XSS hole wearing a
        paperclip. SECURE_CONTENT_TYPE_NOSNIFF stops the browser from
        second-guessing that.
        """
        quote = self.get_object()

        if not quote.file:
            raise Http404("This quote request has no attachment.")

        try:
            handle = quote.file.open("rb")
        except FileNotFoundError:
            raise Http404("This attachment is missing.")

        return FileResponse(
            handle,
            as_attachment=True,
            filename=Path(quote.file.name).name,
            content_type="application/octet-stream",
        )


class ContactMessageViewSet(StaffViewSet):
    """Messages from the contact form."""

    serializer_class = StaffContactMessageSerializer
    queryset = ContactMessage.objects.all()

    search_fields = ("name", "email", "subject", "message")
    filter_fields = ("subject",)
    ordering_fields = ("created_at", "handled", "subject")

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        # `handled` is a boolean, so it cannot go through filter_fields —
        # Django would read the string "false" as True.
        handled = self.request.query_params.get("handled")
        if handled in {"true", "false"}:
            queryset = queryset.filter(handled=handled == "true")

        return queryset


class PackageViewSet(StaffViewSet):
    """Every customer's shipments, not just the caller's.

    Staff may do more to a shipment than a customer can, but not everything:
    once it is in transit it is locked to them too, because from that point
    the row is a record of what was sent rather than a description of what is
    going to be. See Package.LOCKED_STATUSES.
    """

    serializer_class = StaffPackageSerializer
    # select_related, or rendering a page of 25 packages costs 25 extra
    # queries to fetch each owner for the customer block; prefetch, or another
    # 25 for the files the customer has attached to each one.
    queryset = (
        # select_related, or rendering 25 packages costs 25 queries for the
        # owner and 25 more to find out whether each has an invoice;
        # prefetch, or another 25 for the files attached to them.
        Package.objects.select_related("user", "invoice")
        .prefetch_related("documents__uploaded_by")
        .all()
    )

    search_fields = (
        "tracking_number",
        "description",
        "user__first_name",
        "user__last_name",
        "user__email",
    )
    # `user` is what the Add invoice form uses to show only the selected
    # customer's shipments. It narrows the list the admin picks from; it is
    # not what makes the pairing safe - InvoiceCreateSerializer re-checks the
    # shipment against the customer on the way back in, because a filtered
    # dropdown is a convenience and a request body is not evidence.
    filter_fields = ("status", "user")
    ordering_fields = ("created_at", "updated_at", "status", "tracking_number")

    @action(detail=True, methods=["post"])
    def invoice(self, request, pk=None):
        """Raise the invoice for a shipment that has no invoice yet.

        Normally an invoice appears by itself: marking a package paid through
        this dashboard raises one, in perform_update below. That covers a
        package that *becomes* paid here, and nothing else — a row seeded
        straight into `paid`, imported from elsewhere, or set in the Django
        admin never passes through that transition and so never gets one.
        Those shipments had no route to an invoice at all until this action:
        the queue was empty, and the queue is where every other invoice
        control lives.

        Idempotent, because ensure_invoice_for_package is: pressing it twice
        answers with the same invoice rather than raising a second one, and a
        review already under way is left alone.
        """
        package = self.get_object()

        # Anything from PAID onwards. QUOTED is a customer still holding a
        # quote they have not acted on, and billing for it would be inventing
        # a debt; CANCELLED is not owed by anyone.
        if package.status not in Package.PAID_STATUSES:
            raise ValidationError(
                "An invoice can only be raised for a shipment that has been "
                f"paid for. This one is {package.get_status_display()}."
            )

        invoice = ensure_invoice_for_package(package)

        return Response(
            StaffInvoiceSerializer(invoice, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        """Stamp the shipping dates when the status says they happened, raise
        the invoice when the package is marked paid, and tell the customer.

        The dates are read-only over the API on purpose: they record when a
        thing actually happened, and deriving them from the status is what
        keeps them honest. Only ever set, never cleared — moving a package back
        a step is a correction, and forgetting it shipped at all would lose
        information the row already had.
        """
        package = serializer.instance
        previous_status = package.status
        status = serializer.validated_data.get("status", previous_status)
        stamps = {}

        # The serializer has already asked this of the payload and answered
        # with a 400 naming the field. Asked here of the object as well, so
        # that a caller reaching perform_update by some other route still
        # meets the rule, and so that a move nobody can blame a field for is
        # a 409 instead.
        try:
            package.check_transition(status)
        except InvalidShipmentTransition as exc:
            raise ShipmentChangeRefused(str(exc))

        if status == Package.Status.IN_TRANSIT and package.shipped_at is None:
            stamps["shipped_at"] = timezone.now()
        if status == Package.Status.DELIVERED and package.delivered_at is None:
            stamps["delivered_at"] = timezone.now()

        # atomic, so a package is never left marked paid with no invoice behind
        # it: if raising the invoice fails, the status change goes back too.
        try:
            with transaction.atomic():
                package = serializer.save(**stamps)

                # The order's own record of the move, written before anything that
                # follows from it so the history reads in the order it happened.
                # Guarded on an actual change for the same reason the invoice is:
                # a corrected weight is not progress and does not belong on a
                # timeline as though it were.
                if status != previous_status:
                    record_event(
                        package,
                        PackageEvent.Kind.STATUS_CHANGED,
                        actor=self.request.user,
                        from_status=previous_status,
                        to_status=status,
                    )

                # Entering PAID is the event, not being in it. Without the
                # before-and-after comparison, every later edit to a paid package —
                # a corrected weight, a note — would re-run this.
                if status == Package.Status.PAID and previous_status != status:
                    ensure_invoice_for_package(package)

                # Every status change is news, not only the one that raises an
                # invoice. Inside the transaction so a package is never left moved
                # with no record of the customer having been told; the e-mail
                # itself is queued on commit, so nothing is sent for a change that
                # is about to be rolled back. Returns None when the status did not
                # actually change, which is what keeps a corrected weight or an
                # added note from being announced as progress.
                notify_shipment_status(package, previous_status)
        except (ShipmentLocked, InvalidShipmentTransition) as exc:
            # Package.save() had the last word - a bulk edit, a stale
            # form, anything that got past the two checks above. The
            # atomic block is gone with the exception, so the status
            # change, the event, the invoice and the queued e-mail all
            # go back together and the caller is told why.
            raise ShipmentChangeRefused(str(exc))


class BookingViewSet(StaffViewSet):
    """Booking forms, as submitted by customers.

    Only the office half is writable — see StaffBookingSerializer. What the
    sender declared stays as they declared it.
    """

    serializer_class = StaffBookingSerializer
    queryset = Booking.objects.all()

    search_fields = (
        "shipping_number",
        "sender_first_name",
        "sender_last_name",
        "sender_email",
        "sender_phone",
        "recipient_first_name",
        "recipient_last_name",
        "contents",
    )
    filter_fields = ("status", "destination", "freight")
    ordering_fields = ("created_at", "updated_at", "status", "shipping_number")


class InvoiceTransitionRefused(APIException):
    """409 rather than 400.

    The request was well formed and the caller was allowed to make it; the
    invoice simply is not in a state where the move makes sense — usually
    because somebody else got there first. 400 would tell the React app to
    highlight a bad field, and there isn't one to highlight.
    """

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This invoice is not in a state where that is allowed."


class InvoiceViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """The invoice review queue, and the form that raises one by hand.

    Create, read and two actions - but still no update. An invoice's status is
    not a field staff assign, it is the result of a transition, so a PATCH-able
    status would be a way around the state machine and there is no update route
    at all. StaffInvoiceSerializer is read-only end to end; POST goes through
    InvoiceCreateSerializer, which is a plain Serializer and writes nothing by
    itself - see `create` below for what actually happens.

    Creating here does not replace the automatic path. An invoice still appears
    by itself when a shipment is marked paid, through
    ensure_invoice_for_package; this is for the shipment that never went
    through that transition and has no invoice, where the office has the
    document already and wants it on the customer's profile.

    Paginated by the project default (PageNumberPagination, 25 a page), so
    ?page= works here like everywhere else in the dashboard.
    """

    serializer_class = StaffInvoiceSerializer
    # IsStaff, the same class the rest of the dashboard uses. It is checked by
    # DRF before the handler runs, on every request including the two actions
    # below, and it requires an authenticated, active, is_staff account — so a
    # signed-in customer POSTing straight to
    # /api/staff/invoices/3/approve/ gets a 403 and never reaches this code.
    # The React app hiding the button is not what stops them; this is.
    permission_classes = [IsStaff]

    # The queue is the default view. Any other status has to be asked for by
    # name, and only from this list — the same allow-list habit as ?ordering=.
    DEFAULT_STATUS = Invoice.Status.PENDING_REVIEW

    # What ?search= looks in. An invoice is found by the shipment it is for or
    # by whose it is; there is nothing else on the row a person would type.
    SEARCH_FIELDS = (
        "package__tracking_number",
        "package__user__first_name",
        "package__user__last_name",
        "package__user__email",
    )

    # An invoice reference is INV-<year>-<zero-padded pk>, derived rather than
    # stored - see invoicing.pdf.invoice_number - so there is no column to
    # search for it. Typing one off a document is still how somebody looks an
    # invoice up, so the digits at the end are pulled out and matched against
    # the primary key: "INV-2026-00007", "2026-00007" and "7" all find
    # invoice 7. Bounded to nine digits, so a long string of them cannot be
    # turned into an integer nobody wants to compare against.
    INVOICE_REFERENCE = re.compile(r"^(?:inv[-\s]*)?(?:\d{4}[-\s]*)?0*(\d{1,9})$")

    def base_queryset(self):
        # select_related, or a page of 25 invoices costs 25 extra queries for
        # the tracking number and another 25 for the customer.
        return Invoice.objects.select_related(
            "package",
            "package__user",
            "package__delivery_address",
            "reviewed_by",
            "created_by",
        )

    def get_serializer_class(self):
        # The read serializer is read-only end to end, which is what keeps a
        # PATCH from moving the status. The write one is a different shape
        # entirely - a customer, a shipment and a file, none of which are
        # columns on the row.
        if self.action == "create":
            return InvoiceCreateSerializer
        return StaffInvoiceSerializer

    def get_queryset(self):
        queryset = self.base_queryset()

        # Only the list is narrowed. A detail route addresses one known invoice,
        # and filtering there would answer 404 for an invoice that plainly
        # exists — an approve on an already-approved invoice has to come back as
        # a refusal, not as "no such thing".
        if self.action != "list":
            return queryset

        wanted = self.request.query_params.get("status", self.DEFAULT_STATUS)
        if wanted == "all":
            pass
        elif wanted in Invoice.Status.values:
            queryset = queryset.filter(status=wanted)
        else:
            queryset = queryset.filter(status=self.DEFAULT_STATUS)

        # One customer's invoices, for the Customer filter on the page. An
        # id rather than a name: two customers can share a name, and the
        # dropdown already knows which row it means.
        customer = self.request.query_params.get("customer", "").strip()
        if customer.isdigit():
            queryset = queryset.filter(package__user_id=int(customer))

        search = self.request.query_params.get("search", "").strip()
        if search:
            matches = Q()
            for field in self.SEARCH_FIELDS:
                matches |= Q(**{f"{field}__icontains": search})

            # Typing the reference off a document is the most natural way to
            # look an invoice up, so it is matched even though there is no
            # column holding it.
            reference = self.INVOICE_REFERENCE.match(search.lower())
            if reference:
                matches |= Q(pk=int(reference.group(1)))

            queryset = queryset.filter(matches)

        return queryset

    # The create route takes a file, so it takes a multipart body. The rest
    # of the dashboard is JSON and stays that way; DRF's defaults accept both,
    # and this is stated only so the reason is written down.
    def get_parsers(self):
        if getattr(self, "action", None) == "create":
            return [MultiPartParser(), FormParser()]
        return super().get_parsers()

    def create(self, request, *args, **kwargs):
        """Raise an invoice for a shipment, with the document already in hand.

        The order of what follows matters. The pairing of customer to shipment
        is checked first, by the serializer, against the stored rows and not
        against anything the request claimed - that check is the reason this
        endpoint exists, and everything else is bookkeeping around it. Only
        then is the file written, and only then does the invoice move.

        The status the form asked for decides how far it goes:

          pending_review - the row is created and the document is stored, and
              it waits in the queue like any other. Somebody still has to
              approve it, which is the point of asking for review.

          approved - approved in the creator's name, so the audit trail
              answers who let it out of the building. The render task will
              find a document already attached and send it rather than drawing
              over it, which is what makes this a stable state rather than a
              race against a worker.

          sent - approved and sent in one step, and the customer has it. The
              same thing the `document` action does from the queue, for the
              same reason: attaching a document the office has already checked
              is the whole decision, and splitting it across two buttons would
              only invite the second one to be forgotten.
        """
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)

        package = body.validated_data["package"]
        wanted = body.validated_data["status"]
        upload = body.validated_data["pdf"]
        dated = body.validated_data.get("invoice_date") or timezone.localdate()

        # select_for_update on the shipment, so two admins filling in this form
        # for the same shipment at the same moment queue up instead of both
        # passing the duplicate check. The OneToOne would refuse the second one
        # anyway, with an IntegrityError and a 500; this makes it a sentence.
        try:
            with transaction.atomic():
                Package.objects.select_for_update().get(pk=package.pk)

                # Asked again inside the lock. The serializer checked it
                # too, and between those two moments another request can have
                # raised one - which is the race select_for_update is here to
                # settle.
                duplicate = Invoice.objects.filter(package=package).first()
                if duplicate is not None:
                    raise InvoiceAlreadyExists(duplicate)

                invoice = ensure_invoice_for_package(package, created_by=request.user)

                # Written straight rather than through a transition: the date
                # on the document is not part of the state machine, and it has
                # to be on the row before invoice_number reads the year off it.
                Invoice.objects.filter(pk=invoice.pk).update(invoice_date=dated)
                invoice.refresh_from_db()

                # Named the way the render task names its own output, so a
                # hand-attached document and a drawn one are indistinguishable
                # in storage. The uploaded file's own name is never used: it
                # comes from a browser and would put whatever it says on disk.
                filename = (
                    f"{invoice_number(invoice)}-{package.tracking_number}.pdf"
                )
                invoice.pdf.save(filename, upload, save=False)
                stored = invoice.pdf.name

                # Recorded before the transition, so an invoice that is
                # rejected further down still carries a description of the
                # file somebody attached to it.
                invoice.record_document(filename=filename, uploaded_by=request.user)

                if wanted == Invoice.Status.PENDING_REVIEW:
                    # No transition to make - ensure_invoice_for_package
                    # already left it here. Only the document is new.
                    Invoice.objects.filter(pk=invoice.pk).update(pdf=stored)
                    invoice.refresh_from_db()
                else:
                    invoice.approve(request.user)
                    if wanted == Invoice.Status.SENT:
                        # Notifies the customer. This is the invoice arriving.
                        invoice.mark_sent(stored)
                    else:
                        Invoice.objects.filter(pk=invoice.pk).update(pdf=stored)
                        invoice.refresh_from_db()
        except InvalidInvoiceTransition as exc:
            raise InvoiceTransitionRefused(str(exc))

        return Response(
            StaffInvoiceSerializer(
                self.base_queryset().get(pk=invoice.pk),
                context=self.get_serializer_context(),
            ).data,
            status=http_status.HTTP_201_CREATED,
        )

    def _transition(self, apply):
        """Run one transition and answer with the invoice as it now stands.

        select_for_update inside the transaction, so two reviewers pressing the
        button at the same moment queue up rather than interleave. The model's
        conditional UPDATE already makes a double approval impossible; the lock
        turns the loser's race into an orderly wait and a clean refusal.
        """
        invoice = self.get_object()

        try:
            with transaction.atomic():
                locked = Invoice.objects.select_for_update().get(pk=invoice.pk)
                apply(locked)
        except InvalidInvoiceTransition as exc:
            raise InvoiceTransitionRefused(str(exc))

        return Response(self.get_serializer(self.base_queryset().get(pk=invoice.pk)).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        """Stream the rendered invoice to a member of staff.

        Exists so that StaffInvoiceSerializer does not have to hand out the
        storage path. It used to expose the file's own media URL, which is a
        working download only if MEDIA_ROOT is published by the web server —
        and a MEDIA_ROOT that is published is one where invoices/2026/
        INV-2026-00002-PLSM-0002.pdf can be fetched by anyone who can guess a
        tracking number, which every customer of ours can. The customer-facing
        serializer already refused to do this and said why; this is the
        dashboard catching up with it.

        IsStaff is checked by DRF before this runs, so unlike the customer
        route there is no per-object narrowing to do: staff may see every
        invoice, which is the job.
        """
        invoice = self.get_object()

        if not invoice.pdf:
            raise Http404("This invoice has no document yet.")

        try:
            handle = invoice.pdf.open("rb")
        except FileNotFoundError:
            # A row pointing at bytes that are not there — a media directory
            # restored without its contents. A 404, not the 500 that opening a
            # missing file would otherwise produce.
            raise Http404("This invoice's document is missing.")

        # Inline, unlike the customer route, which sends as_attachment so the
        # document lands in a downloads folder under a name that means
        # something. The dashboard opens this in a new tab and staff work
        # through a queue of them; forcing a download for each would be a
        # worse job than the one they had before this route existed.
        #
        # Safe to render in place: every PDF here is either drawn by our own
        # ReportLab code or an upload that InvoiceDocumentSerializer checked
        # for a %PDF- signature, the content type is stated rather than
        # guessed, and SECURE_CONTENT_TYPE_NOSNIFF stops a browser from
        # deciding it is HTML after all.
        return FileResponse(
            handle,
            as_attachment=False,
            filename=f"{invoice_number(invoice)}.pdf",
            content_type="application/pdf",
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """PENDING_REVIEW -> APPROVED. Anything else is a 409."""
        return self._transition(lambda invoice: invoice.approve(request.user))

    @action(
        detail=True,
        methods=["post"],
        # This one route takes a file, so it takes a multipart body. The rest
        # of the dashboard is JSON and stays that way.
        parser_classes=[MultiPartParser, FormParser],
    )
    def document(self, request, pk=None):
        """Attach a PDF by hand, and send the invoice with it.

        The normal path is invoicing.tasks.render_approved_invoice, which
        draws the document on a worker when an invoice is approved. This is
        the way in when that has not happened or must not: no worker running,
        a render that failed, or an invoice the office has drawn up itself and
        wants to send as it stands.

        Three states accept an upload, for three different reasons:

          PENDING_REVIEW - the invoice is in the queue and the person
              uploading has decided it is right. Uploading approves it in
              their name and sends it in one step, which is what makes this
              "attach the document and the customer has it" rather than a
              two-button ritual. The approval is not skipped, it is recorded:
              reviewed_by is the uploader, so the audit trail still answers
              who let this document out of the building.

          APPROVED - already reviewed, waiting for a document. Attaching one
              is what sends it: the manual equivalent of the render finishing,
              notification included.

          SENT - the customer already has a document and it is wrong. The
              status does not move and they are not told again; see
              Invoice.replace_document.

        DRAFT and REJECTED are refused with a 409. A rejected invoice has
        something wrong with it that somebody wrote down, and the way back is
        to correct it and resubmit — not to paper over the rejection with a
        file.
        """
        invoice = self.get_object()

        body = InvoiceDocumentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        upload = body.validated_data["pdf"]

        accepted = (
            Invoice.Status.PENDING_REVIEW,
            Invoice.Status.APPROVED,
            Invoice.Status.SENT,
        )
        if invoice.status not in accepted:
            raise InvoiceTransitionRefused(
                "A document cannot be attached to an invoice that is "
                f"{invoice.get_status_display()}."
            )

        # The name the caller sees, built the same way the render task builds
        # it, so a hand-attached document is indistinguishable from a drawn
        # one in storage. The uploaded file's own name is not used: it comes
        # from the browser and would put whatever it says on our disk.
        filename = f"{invoice_number(invoice)}-{invoice.package.tracking_number}.pdf"

        # Kept so it can be removed once the new one is safely recorded. Doing
        # it the other way round — delete, then write — loses the customer's
        # document if the write fails.
        previous = invoice.pdf.name if invoice.pdf else ""

        # save=False: the column is written by the transition below, together
        # with whatever else moves, so the row never shows a document without
        # the status that belongs with it.
        invoice.pdf.save(filename, upload, save=False)
        stored = invoice.pdf.name

        # Whoever uploads is the one who chose this file, which is not
        # necessarily whoever raised the invoice or whoever approved it — the
        # three are separate columns for exactly this case.
        invoice.record_document(filename=filename, uploaded_by=request.user)

        try:
            # One transaction around the whole move, which is what keeps the
            # render out of the way. approve() schedules the drawing task
            # through transaction.on_commit, so inside an atomic block it
            # cannot start until this has finished — and by then the invoice
            # is SENT, which is precisely the state the task declines to touch.
            # Without this the task would run between the two steps below,
            # draw a second document, and win the race to be the one the
            # customer receives.
            with transaction.atomic():
                if invoice.status == Invoice.Status.PENDING_REVIEW:
                    # Approving in the uploader's name, so the invoice carries
                    # a reviewer like every other one. The decision is not
                    # skipped here, it is attributed: whoever uploads is
                    # saying the invoice is right.
                    invoice.approve(request.user)

                if invoice.status == Invoice.Status.SENT:
                    invoice.replace_document(stored)
                else:
                    # Notifies the customer. This is the invoice arriving.
                    invoice.mark_sent(stored)
        except InvalidInvoiceTransition as exc:
            # Somebody moved the invoice between the check above and here. The
            # file this request wrote is not on any row, so it is removed
            # rather than left behind as an orphan nothing points at.
            invoice.pdf.storage.delete(stored)
            raise InvoiceTransitionRefused(str(exc))

        # Only now that the new document is recorded. Guarded, because storage
        # hands back the name it actually used — if something was already
        # there it will have suffixed it, and deleting `previous` when the two
        # are the same name would delete what was just written.
        if previous and previous != stored:
            invoice.pdf.storage.delete(previous)

        return Response(self.get_serializer(self.base_queryset().get(pk=invoice.pk)).data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        """APPROVED -> SENT, for an invoice that already has its document.

        The other half of "approve it, but do not send yet" on the Add invoice
        form. An invoice raised that way is approved, carries the PDF the
        office attached, and is deliberately not on the customer's profile —
        the render worker leaves it exactly there rather than sending it from
        somewhere nobody can see. This is the button that finishes it.

        Anything else is a 409: an invoice still in review has not been
        approved by anybody, and one already sent does not need sending twice.
        """
        return self._transition(lambda invoice: invoice.send_attached())

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """PENDING_REVIEW -> REJECTED, with a reason. Anything else is a 409."""
        body = InvoiceRejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reason = body.validated_data["rejection_reason"]

        return self._transition(lambda invoice: invoice.reject(request.user, reason))


class CustomerViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Everyone with an account, with their addresses and shipment counts.

    These are the same User and Address rows the customer edits on their own
    profile page - one record seen from two sides, not a back-office copy of
    it. A phone number corrected here is the one the customer reads next time
    they open their profile, and a change they make there is what the next
    load of this table shows. Nothing has to be kept in step, because there is
    only ever one row.

    Create is the one exception to the rule that the back office never makes
    a row on a customer's behalf, and it is a narrow one: this opens an
    account for somebody who is standing in the office, or for a colleague who
    needs to sign in tomorrow morning. It sets no password - see
    StaffCustomerCreateSerializer - so an account made here is unusable until
    its owner has followed the link and chosen one. There is still no delete.

    What staff may change is the contact details: name, e-mail, phone, and the
    delivery address through the `address` action below. Those are the fields
    the office finds wrong - an agent at the destination cannot arrange a
    handover against a mistyped number, and the customer has no way of knowing
    it is mistyped.

    Two things stay out. The username is what somebody types to sign in, and
    the role moves through the `role` action, which is where its own refusals
    live. An erased account is refused by both writes below: that row is kept
    to hold shipment records together and is no longer a person.
    """

    serializer_class = StaffCustomerSerializer
    permission_classes = [IsStaff]

    def get_serializer_class(self):
        """A different shape going in from the one coming out.

        What a new account needs is four details and a role; what the table
        wants back is a row with package counts, totals and addresses on it.
        Forcing one serializer to be both would mean a create form carrying
        fields nobody fills in.
        """
        if self.action == "create":
            return StaffCustomerCreateSerializer
        return StaffCustomerSerializer

    def create(self, request, *args, **kwargs):
        """Open the account, then answer with the row the table shows.

        The create serializer's own output would be the four fields that went
        in, which is not a row this table can render. Re-serialising through
        the list queryset is what lets the page insert the new customer
        without refetching the whole page.
        """
        writer = self.get_serializer(data=request.data)
        writer.is_valid(raise_exception=True)
        self.perform_create(writer)

        row = self.get_queryset().get(pk=writer.instance.pk)
        return Response(
            StaffCustomerSerializer(row, context=self.get_serializer_context()).data,
            status=http_status.HTTP_201_CREATED,
        )

    def perform_create(self, serializer):
        """Create the account, and invite its owner into it once it is real.

        on_commit, so the e-mail cannot go out for an account that a later
        failure in this request rolls back - somebody clicking a link to an
        account that does not exist is a worse morning than a slightly later
        e-mail.

        The invitation itself is fail_silently on the other side: the account
        has been created either way, and a mail server having a bad afternoon
        must not report a created account as a 500.
        """
        user = serializer.save()

        transaction.on_commit(lambda: send_account_invite(user))

    @staticmethod
    def _package_total(statuses):
        """What one customer's packages in `statuses` come to, as a subquery.

        A subquery rather than another .annotate(Sum(...)) over the packages
        join, which is the obvious way to write this and is wrong here. The
        search below joins the address table, and a customer with two
        addresses comes back as two rows — so a joined Sum would add their
        packages up twice and quietly double what they owe. Count survives
        that because it is already distinct=True; Sum has no such escape,
        because summing distinct *values* would drop a second package that
        happened to cost the same as the first.

        A subquery does its own aggregate against the packages table alone, so
        it cannot be multiplied by anything the outer query joins to. Coalesce
        turns "this customer has no such packages" from NULL into 0, so the
        API sends a figure rather than a hole the browser has to interpret.
        """
        money = DecimalField(max_digits=12, decimal_places=2)

        return Coalesce(
            Subquery(
                Package.objects.filter(user=OuterRef("pk"), status__in=statuses)
                .values("user")
                .annotate(total=Sum("value_eur"))
                .values("total")[:1],
                output_field=money,
            ),
            0,
            output_field=money,
        )

    def get_queryset(self):
        return (
            User.objects.all()
            # prefetch, or rendering 25 customers costs 25 extra queries for
            # their addresses; annotate, or another 25 for the counts.
            .prefetch_related("addresses")
            .annotate(
                package_count=Count("packages", distinct=True),
                # What they have settled, and what they are still holding a
                # quote for. Two subqueries rather than two more joins — see
                # _package_total.
                paid_eur=self._package_total(Package.PAID_STATUSES),
                outstanding_eur=self._package_total(
                    Package.AWAITING_PAYMENT_STATUSES
                ),
            )
            .order_by("-date_joined")
        )

    search_fields = (
        "username",
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "addresses__city",
        "addresses__street",
    )
    filter_fields = ()
    ordering_fields = ("date_joined", "username", "email", "last_name")

    def filter_queryset(self, queryset):
        params = self.request.query_params

        search = params.get("search", "").strip()
        if search:
            matches = Q()
            for field in self.search_fields:
                matches |= Q(**{f"{field}__icontains": search})
            # Searching the address fields joins the address table, which
            # repeats a customer once per address they own.
            queryset = queryset.filter(matches).distinct()

        # Erased accounts are kept only to hold shipment records together.
        # They are in the list by default, marked, because a package still
        # points at one — but they can be filtered out.
        erased = params.get("erased")
        if erased == "false":
            queryset = queryset.filter(anonymised_at__isnull=True)
        elif erased == "true":
            queryset = queryset.filter(anonymised_at__isnull=False)

        if params.get("staff") == "true":
            queryset = queryset.filter(is_staff=True)

        ordering = params.get("ordering", "").strip()
        if ordering.lstrip("-") in self.ordering_fields:
            queryset = queryset.order_by(ordering)

        return queryset

    def _refuse_if_erased(self, customer):
        """An erased row holds no personal data and nobody to correct it for.

        Writing to one would put a name back on an account that was erased on
        request, which is the one outcome the erasure was for.
        """
        if customer.anonymised_at is not None:
            raise ValidationError("This account has been erased.")

    def _row(self, customer):
        """The customer back through the list queryset.

        Straight from `serializer.instance` the row would be missing the
        `package_count` annotation and would re-query the addresses, so the
        table would get a shape unlike every other row it is holding.
        """
        return Response(self.get_serializer(self.get_queryset().get(pk=customer.pk)).data)

    def update(self, request, *args, **kwargs):
        """Correct a customer's name, e-mail or phone number.

        The serializer decides what is writable; this only refuses the erased
        case and answers with the whole row so the table can swap it in.
        """
        target = self.get_object()
        self._refuse_if_erased(target)

        serializer = self.get_serializer(
            target, data=request.data, partial=kwargs.pop("partial", False)
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return self._row(target)

    @action(detail=True, methods=["post"])
    def address(self, request, pk=None):
        """Save one of this customer's delivery addresses.

        POST the fields with an `id` to correct an existing address, without
        one to add it. The customer's own profile page works the same way and
        writes to the same table, so the address a staff member fixes here is
        the one that pre-fills that customer's next order.

        The id is looked up within this customer's own addresses, so an id
        belonging to somebody else is a 404 rather than somebody else's
        address being rewritten from a URL that says otherwise. The owner is
        set from the URL for the same reason and is never read from the body.
        """
        target = self.get_object()
        self._refuse_if_erased(target)

        address_id = request.data.get("id")
        existing = (
            get_object_or_404(target.addresses, pk=address_id)
            if address_id not in (None, "")
            else None
        )

        # Partial only when correcting: a new address has to arrive complete,
        # an existing one may be edited a field at a time.
        serializer = StaffAddressWriteSerializer(
            existing, data=request.data, partial=existing is not None
        )
        serializer.is_valid(raise_exception=True)
        # Address.save() keeps exactly one default per customer, so setting
        # is_default here is what clears the previous one.
        serializer.save(user=target)

        return self._row(target)

    @action(detail=True, methods=["post"])
    def role(self, request, pk=None):
        """Move an account between customer, warehouse and admin.

        POST {"role": "admin"}, {"role": "warehouse"} or {"role": "customer"}.
        Two flags are set together, and always both, so that the three roles
        stay three rather than drifting into four: `is_staff` is the office and
        the same flag that opens Django's own /admin/, `is_warehouse` is the
        floor and opens the scanner and nothing else.

        Three accounts this refuses to touch, and the reasons are different:

        - your own, because demoting yourself would take the dashboard away
          mid-click, and promoting yourself is already true;
        - a superuser, because that account holds more than this screen
          manages and clearing is_staff would half-lock it out of /admin/
          while leaving every other permission in place;
        - an erased one, which is a row kept to hold shipment records
          together and no longer a person who can sign in at all.

        StaffCustomerSerializer.can_change_role answers the same three
        questions for the table, so the control is greyed out rather than
        pressed and refused - but this is the check that holds.
        """
        target = self.get_object()

        if target.pk == request.user.pk:
            raise PermissionDenied("You cannot change your own role.")
        if target.is_superuser:
            raise PermissionDenied(
                "Superuser accounts are managed in the Django admin."
            )
        if target.anonymised_at is not None:
            raise ValidationError("This account has been erased.")

        body = StaffRoleSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        # Only these two columns, and only when the pair actually moves: a
        # repeated press should not rewrite the row or count as a change.
        # Written together because a role is the pair - setting one and
        # leaving the other is how an account ends up being both, or neither.
        if (
            target.is_staff != body.grants_staff
            or target.is_warehouse != body.grants_warehouse
        ):
            target.is_staff = body.grants_staff
            target.is_warehouse = body.grants_warehouse
            target.save(
                update_fields=["is_staff", "is_warehouse", "updated_at"]
            )

        # Back through the list queryset, so the row the table swaps in carries
        # the same package_count and addresses the rest of them do.
        fresh = self.get_queryset().get(pk=target.pk)
        return Response(self.get_serializer(fresh).data)


class OverviewView(APIView):
    """The dashboard landing page: what needs attention, and recent activity.

    One request rather than four, so the page paints in a single round trip.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        try:
            days = int(request.query_params.get("days", RECENT_DAYS))
        except ValueError:
            days = RECENT_DAYS
        if days not in ALLOWED_RANGES:
            days = RECENT_DAYS

        # From the start of the first day, so the chart's first column covers
        # a whole day like every other one rather than a partial one.
        since = (timezone.now() - timedelta(days=days - 1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        quotes = QuoteRequest.objects.all()
        messages = ContactMessage.objects.all()
        packages = Package.objects.all()
        bookings = Booking.objects.all()
        invoices = Invoice.objects.all()
        documents = PackageDocument.objects.all()
        # Anonymised rows are deleted customers kept only to hold their
        # shipment records together; counting them as customers would
        # overstate the business.
        customers = User.objects.filter(is_active=True, anonymised_at__isnull=True)

        quote_status = counts_by(quotes, "status")
        package_status = counts_by(packages, "status")

        context = {"request": request}
        # Each model already orders newest first, so a plain slice is the
        # most recent few.
        recent_quotes = quotes[:RECENT_LIMIT]
        recent_messages = messages[:RECENT_LIMIT]
        recent_packages = packages.select_related("user")[:RECENT_LIMIT]

        return Response(
            {
                "period_days": days,
                "ranges": list(ALLOWED_RANGES),
                # One row per day for the chart.
                "daily": daily_series(
                    since,
                    days,
                    quotes=quotes,
                    packages=packages,
                    messages=messages,
                ),
                "quotes": {
                    "total": sum(quote_status.values()),
                    "new": quote_status.get(QuoteRequest.Status.NEW, 0),
                    "recent": quotes.filter(created_at__gte=since).count(),
                    "trend": trend(quotes, "created_at", since, days),
                    "by_status": quote_status,
                },
                "messages": {
                    "total": messages.count(),
                    "unhandled": messages.filter(handled=False).count(),
                    "recent": messages.filter(created_at__gte=since).count(),
                    "trend": trend(messages, "created_at", since, days),
                },
                "packages": {
                    "total": sum(package_status.values()),
                    "in_transit": package_status.get(Package.Status.IN_TRANSIT, 0),
                    "awaiting_action": (
                        package_status.get(Package.Status.QUOTED, 0)
                        + package_status.get(Package.Status.PAID, 0)
                    ),
                    "recent": packages.filter(created_at__gte=since).count(),
                    "trend": trend(packages, "created_at", since, days),
                    # What share of everything ever shipped has arrived. The
                    # donut on the overview reads this rather than working it
                    # out from by_status, so the page and the API agree on
                    # what "delivered" counts.
                    "delivered": package_status.get(Package.Status.DELIVERED, 0),
                    "by_status": package_status,
                },
                "bookings": {
                    "total": bookings.count(),
                    "new": bookings.filter(status=Booking.Status.NEW).count(),
                    "recent": bookings.filter(created_at__gte=since).count(),
                },
                # pending_review is what the sidebar's pill counts: the only
                # number here that is a queue somebody has to work through.
                # An approved invoice with no document yet is a render that
                # failed or never ran, which is worth seeing separately —
                # nothing is waiting on a person, but something is stuck.
                "invoices": {
                    "total": invoices.count(),
                    "pending_review": invoices.filter(
                        status=Invoice.Status.PENDING_REVIEW
                    ).count(),
                    "rejected": invoices.filter(
                        status=Invoice.Status.REJECTED
                    ).count(),
                    "awaiting_document": invoices.filter(
                        status=Invoice.Status.APPROVED, pdf=""
                    ).count(),
                    "recent": invoices.filter(created_at__gte=since).count(),
                    "trend": trend(invoices, "created_at", since, days),
                    # Raised and finished with: the customer has the document.
                    "sent": invoices.filter(status=Invoice.Status.SENT).count(),
                },
                # What customers have sent in. `unattached` is the pill:
                # a receipt filed against no shipment is one nobody has
                # placed yet, and it is the only number here that is work.
                "documents": {
                    "total": documents.count(),
                    "unattached": documents.filter(package__isnull=True).count(),
                    "recent": documents.filter(created_at__gte=since).count(),
                },
                "customers": {
                    "total": customers.count(),
                    "recent": customers.filter(date_joined__gte=since).count(),
                    "trend": trend(customers, "date_joined", since, days),
                },
                "recent_quotes": StaffQuoteRequestSerializer(
                    recent_quotes, many=True, context=context
                ).data,
                "recent_messages": StaffContactMessageSerializer(
                    recent_messages, many=True, context=context
                ).data,
                "recent_packages": StaffPackageSerializer(
                    recent_packages, many=True, context=context
                ).data,
            }
        )
