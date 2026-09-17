"""The intake sheet API, mounted at /api/staff/intake/ by staff/urls.py.

Kept in this app rather than in staff/views.py, which is where every other
back-office view lives. The reason is that the intake sheet brings a model, a
state change, a recipient rule, a worker and its own wording with it - a
subsystem, not another table on the dashboard - and staff/views.py is already
long enough that a reader looking for the shipment rules has to scroll past
things that have nothing to do with them.

It subclasses the staff dashboard's own base view, so the search, the
filtering and the ordering are the same ones every other staff list uses. The
one thing it deliberately changes is the permission: these routes are the only
ones a warehouse account can reach, and IsWarehouseOrStaff below is what lets
it. Both classes still live in staff/permissions.py, so who may call what is
answered in one file rather than invented here.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from staff.permissions import IsWarehouseOrStaff, WarehouseRateThrottle
from staff.views import StaffViewSet

from . import scanning, shipments
from .models import AlreadyReleased, IntakeSheet, NotReleased
from .recipients import handover_recipients
from .serializers import (
    IntakeSheetSerializer,
    ScannedBookingSerializer,
    ScannedPackageSerializer,
    missing_for_release,
)
from .services import release_sheet


class SheetLocked(APIException):
    """An edit to a sheet that has already been handed over.

    409 rather than 400: the request was well formed and the caller was
    allowed to make it. The sheet has simply been sent, and a record of what
    was handed over is not a form - the same rule, and the same status code,
    as a shipment that has already left.
    """

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = (
        "This intake sheet has been released and can no longer be changed."
    )


class IntakeSheetViewSet(mixins.CreateModelMixin, StaffViewSet):
    """Warehouse intake sheets: list, read, fill in, and hand over.

    Create is added to the staff base, which otherwise forbids it. That rule
    exists because nothing in the back office should be able to manufacture a
    customer's submission, and this is not one: an intake sheet is written by
    staff, about goods they are looking at, and there is nowhere else it could
    come from.

    Still no delete. A sheet is the record that a delivery was received, and a
    mistaken one is better corrected while it is a draft than removed.
    """

    # The one route under /api/staff/ that is not office-only. A warehouse
    # account has is_warehouse without is_staff, so every other viewset in the
    # dashboard - invoices, customers, quotes, shipments - still refuses it,
    # and so does Django's own /admin/.
    permission_classes = [IsWarehouseOrStaff]
    throttle_classes = [WarehouseRateThrottle]

    serializer_class = IntakeSheetSerializer

    queryset = IntakeSheet.objects.select_related(
        "created_by", "released_by", "booking", "package"
    ).prefetch_related("measurements")

    search_fields = (
        "reference",
        "supplier",
        "sender",
        "recipient",
        "destination",
        "employees",
        "employee_name",
        "notes",
    )
    filter_fields = ("status", "freight")
    ordering_fields = (
        "created_at", "updated_at", "received_on", "released_at", "status"
    )

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        # `?measured=true` for the office's Measurements page: only sheets
        # with at least one line on them. A boolean, so not a filter_field -
        # Django would read the string "false" as True.
        measured = self.request.query_params.get("measured")
        if measured in {"true", "false"}:
            queryset = queryset.filter(
                measurements__isnull=measured == "false"
            ).distinct()

        # `?mine=true` for the warehouse profile page: the sheets this person
        # started. Only ever the caller's own, so there is no user id to pass.
        if self.request.query_params.get("mine") == "true":
            queryset = queryset.filter(created_by=self.request.user)

        return queryset

    def perform_create(self, serializer):
        """Stamp the sheet with whoever is filling it in, and sign it as them.

        `employee_name` is written here and nowhere else. The serializer holds
        it read-only, so a name sent by a caller is discarded rather than
        refused - there is no version of this request in which somebody else's
        name is the right answer, and a 400 would only invite a retry.

        The signature and `created_by` therefore always agree. They are kept
        as two fields because they answer different questions later: one is a
        name that must not change, the other a link that must not be trusted
        to still exist.
        """
        user = self.request.user

        sheet = serializer.save(
            created_by=user,
            employee_name=user.get_full_name() or user.get_username(),
        )

        self._prefill_from_link(sheet)
        self._share_freight(sheet)

    def _prefill_from_link(self, sheet):
        """Copy across what the office already knows, when there is a link.

        A sheet started from a scan arrives with a booking or a shipment
        attached, and the destination and the names on it were typed by
        somebody weeks ago. Asking a person holding a phone to read them off a
        screen and type them again is how two records of one consignment start
        to disagree.

        Only ever into boxes left empty, and only at creation. This is a head
        start on a blank form, not a rule - what the warehouse sees in front
        of them beats what was booked, every time, and the moment they correct
        a box it stays corrected.
        """
        booking = sheet.booking
        package = sheet.package

        if booking is None and package is None:
            return

        fields = {}

        if booking is not None:
            fields = {
                "destination": booking.destination_label,
                "sender": booking.sender_name,
                "recipient": booking.recipient_name,
                "freight": booking.freight,
            }
        elif package is not None:
            fields = {
                "destination": package.destination_label,
                "recipient": package.user.get_full_name() if package.user else "",
                "freight": package.freight,
            }

        filled = {
            field: value
            for field, value in fields.items()
            if value and not getattr(sheet, field)
        }

        if filled:
            for field, value in filled.items():
                setattr(sheet, field, value)
            sheet.save(update_fields=list(filled))

    def perform_update(self, serializer):
        """Refuse any edit once the sheet has gone out.

        Checked against the stored row rather than the instance the serializer
        is holding, because `status` is read-only in the serializer and so the
        two cannot differ - but the row can have been released by somebody
        else between this request being sent and being handled.
        """
        if serializer.instance.released:
            raise SheetLocked()

        self._share_freight(serializer.save())

    def _share_freight(self, sheet):
        """Give the linked shipment the sheet's freight, if it has none yet.

        Only into a blank: when the office has already decided how a shipment
        travels, a worker picking the other box on a form does not overrule it.
        """
        package = sheet.package
        if package is not None and sheet.freight and not package.freight:
            package.freight = sheet.freight
            package.save(update_fields=["freight", "updated_at"])

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        """Hand the sheet to the rest of the staff, and mail it to them.

        Three answers:

        * 400, listing by name every box still unanswered. The React app shows
          the same list beside the button before it is pressed; this is what
          holds when two people have the sheet open and one of them clears a
          field.
        * 409, when somebody has already released it.
        * 200 and the sheet, with `emailed_at` still null - the mail is queued
          on commit and leaves on a worker, so a sheet is released the instant
          this answers whether or not the mail server is having a good day.

        The transaction wraps the state change only. transaction.on_commit
        inside release_sheet is what holds the e-mail back until this block
        has actually committed.
        """
        sheet = self.get_object()

        missing = missing_for_release(sheet)
        if missing:
            raise ValidationError(
                {
                    "missing": missing,
                    "detail": (
                        "Fill in the rest of the sheet before sending it on: "
                        + ", ".join(missing)
                        + "."
                    ),
                }
            )

        try:
            with transaction.atomic():
                release_sheet(sheet, by=request.user)
        except AlreadyReleased as error:
            raise SheetLocked(str(error)) from error

        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Put a released sheet back into draft, so a mistake can be fixed.

        No e-mail goes out here, and that is the point: reopening is not the
        correction, it is picking the sheet back up. What gets sent is the
        next release, which says plainly that it is a correction and which
        version it is.

        409 when the sheet is already a draft - somebody else reopened it
        first, and nothing needs doing.
        """
        sheet = self.get_object()

        try:
            sheet.reopen()
        except NotReleased as error:
            raise SheetLocked(str(error)) from error

        return Response(self.get_serializer(sheet).data)

    @action(detail=False, methods=["get"])
    def scan(self, request):
        """What a code read off a box points at. `?code=` and nothing else.

        A GET, and it writes nothing. The whole risk of a scanner is the
        mis-scan - the label on the box behind, a code printed twice on one
        carton - and a lookup that created a row on every read would turn each
        of those into a junk sheet somebody has to find and explain. So this
        answers, and starting the sheet is a second, deliberate tap.

        The answer names what was found in `match`, and carries whichever of
        the three it was. See warehouse/scanning.py for the order they are
        asked in and why.
        """
        found = scanning.find(request.query_params.get("code", ""))

        # The shipment behind whatever matched - directly, or through the
        # sheet already written for it - in full, so the scanner can show the
        # customer, the stage and the invoice without a second lookup.
        package = found["package"] or (found["sheet"].package if found["sheet"] else None)
        if package is None:
            package = shipments.find_shipment(found["code"])
        shipment = (
            shipments.ShipmentDetailSerializer(
                shipments.detail_queryset().get(pk=package.pk),
                context={"request": request},
            ).data
            if package is not None
            else None
        )

        return Response(
            {
                "code": found["code"],
                "match": found["match"],
                "shipment": shipment,
                "sheet": (
                    self.get_serializer(found["sheet"]).data
                    if found["sheet"] is not None
                    else None
                ),
                "package": (
                    ScannedPackageSerializer(found["package"]).data
                    if found["package"] is not None
                    else None
                ),
                "booking": (
                    ScannedBookingSerializer(found["booking"]).data
                    if found["booking"] is not None
                    else None
                ),
            }
        )

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """The warehouse home screen: a handful of counts and the latest sheets.

        Its own route rather than the office overview, which is IsStaff and
        says nothing a warehouse account is allowed to know. Everything here
        is about intake sheets, so it sits behind the same permission as they
        do.

        "Today" is the server's local date, the same one received_on defaults
        to, so a sheet started just after midnight counts towards the new day.
        """
        today = timezone.localdate()
        sheets = IntakeSheet.objects.all()
        drafts = sheets.filter(status=IntakeSheet.Status.DRAFT)

        recent = self.get_queryset().order_by("-updated_at")[:5]
        week_start = today - timedelta(days=today.weekday())

        return Response(
            {
                "drafts": drafts.count(),
                "my_drafts": drafts.filter(created_by=request.user).count(),
                "started_today": sheets.filter(created_at__date=today).count(),
                "released_today": sheets.filter(released_at__date=today).count(),
                # The profile page's own numbers: what this person has handed
                # over. Released rather than started, because a draft is not
                # finished work yet.
                "my_released_today": sheets.filter(
                    released_by=request.user, released_at__date=today
                ).count(),
                "my_released_week": sheets.filter(
                    released_by=request.user, released_at__date__gte=week_start
                ).count(),
                "my_released_total": sheets.filter(released_by=request.user).count(),
                "recent": self.get_serializer(recent, many=True).data,
            }
        )

    @action(detail=False, methods=["get"])
    def recipients(self, request):
        """Who a release would be mailed to, for the line above the button.

        Worth a round trip of its own. The commonest way for this whole
        feature to fail silently is a staff account with no work address on
        it: the sheet releases, the dashboard says so, and nobody's inbox ever
        knows. Showing the count - and saying plainly when it is zero - turns
        that into something somebody notices on the first sheet rather than
        the fiftieth.
        """
        addresses = handover_recipients(exclude=request.user)

        return Response({"count": len(addresses), "addresses": addresses})
