"""The staff dashboard API, mounted at /api/staff/.

Everything here is behind IsStaff. The customer-facing API in accounts/ and
enquiries/ is scoped to the caller's own rows; these views are the deliberate
exception, so the permission class is the whole security story and is applied
once, on a shared base class, rather than remembered per view.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Package
from bookings.models import Booking
from bookings.serializers import StaffBookingSerializer
from enquiries.models import ContactMessage, QuoteRequest
from invoicing.models import InvalidInvoiceTransition, Invoice
from invoicing.serializers import InvoiceRejectSerializer, StaffInvoiceSerializer
from invoicing.services import ensure_invoice_for_package
from notifications.services import notify_shipment_status

from .permissions import IsStaff
from .serializers import (
    StaffAddressWriteSerializer,
    StaffContactMessageSerializer,
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
    """Every customer's shipments, not just the caller's."""

    serializer_class = StaffPackageSerializer
    # select_related, or rendering a page of 25 packages costs 25 extra
    # queries to fetch each owner for the customer block.
    queryset = Package.objects.select_related("user").all()

    search_fields = (
        "tracking_number",
        "description",
        "user__first_name",
        "user__last_name",
        "user__email",
    )
    filter_fields = ("status",)
    ordering_fields = ("created_at", "updated_at", "status", "tracking_number")

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

        if status == Package.Status.IN_TRANSIT and package.shipped_at is None:
            stamps["shipped_at"] = timezone.now()
        if status == Package.Status.DELIVERED and package.delivered_at is None:
            stamps["delivered_at"] = timezone.now()

        # atomic, so a package is never left marked paid with no invoice behind
        # it: if raising the invoice fails, the status change goes back too.
        with transaction.atomic():
            package = serializer.save(**stamps)

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
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """The invoice review queue.

    Read-only plus two actions, rather than the usual StaffViewSet: an invoice's
    status is not a field staff assign, it is the result of a transition. A
    PATCH-able status would be a way around the state machine, so there is no
    update route at all and StaffInvoiceSerializer is read-only end to end.

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

    def base_queryset(self):
        # select_related, or a page of 25 invoices costs 25 extra queries for
        # the tracking number and another 25 for the customer.
        return Invoice.objects.select_related("package", "package__user", "reviewed_by")

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
            return queryset
        if wanted not in Invoice.Status.values:
            wanted = self.DEFAULT_STATUS

        return queryset.filter(status=wanted)

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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """PENDING_REVIEW -> APPROVED. Anything else is a 409."""
        return self._transition(lambda invoice: invoice.approve(request.user))

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """PENDING_REVIEW -> REJECTED, with a reason. Anything else is a 409."""
        body = InvoiceRejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reason = body.validated_data["rejection_reason"]

        return self._transition(lambda invoice: invoice.reject(request.user, reason))


class CustomerViewSet(
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

    def get_queryset(self):
        return (
            User.objects.all()
            # prefetch, or rendering 25 customers costs 25 extra queries for
            # their addresses; annotate, or another 25 for the counts.
            .prefetch_related("addresses")
            .annotate(package_count=Count("packages", distinct=True))
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

    @action(detail=True, methods=["post"])
    def role(self, request, pk=None):
        """Make an account an admin, or put it back to a plain customer.

        POST {"role": "admin"} or {"role": "customer"}. `is_staff` is the flag
        being set: the same one IsStaff checks on every request here and the
        same one that opens Django's own /admin/, so there is one grant rather
        than two that drift apart.

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

        # Only ever this one column, and only when it actually moves: a repeated
        # press should not rewrite the row or count as a change.
        if target.is_staff != body.grants_staff:
            target.is_staff = body.grants_staff
            target.save(update_fields=["is_staff", "updated_at"])

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
                    "by_status": quote_status,
                },
                "messages": {
                    "total": messages.count(),
                    "unhandled": messages.filter(handled=False).count(),
                    "recent": messages.filter(created_at__gte=since).count(),
                },
                "packages": {
                    "total": sum(package_status.values()),
                    "in_transit": package_status.get(Package.Status.IN_TRANSIT, 0),
                    "awaiting_action": (
                        package_status.get(Package.Status.QUOTED, 0)
                        + package_status.get(Package.Status.PAID, 0)
                    ),
                    "recent": packages.filter(created_at__gte=since).count(),
                    "by_status": package_status,
                },
                "bookings": {
                    "total": bookings.count(),
                    "new": bookings.filter(status=Booking.Status.NEW).count(),
                    "recent": bookings.filter(created_at__gte=since).count(),
                },
                "customers": {
                    "total": customers.count(),
                    "recent": customers.filter(date_joined__gte=since).count(),
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
