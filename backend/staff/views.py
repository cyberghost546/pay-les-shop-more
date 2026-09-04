"""The staff dashboard API, mounted at /api/staff/.

Everything here is behind IsStaff. The customer-facing API in accounts/ and
enquiries/ is scoped to the caller's own rows; these views are the deliberate
exception, so the permission class is the whole security story and is applied
once, on a shared base class, rather than remembered per view.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Package
from bookings.models import Booking
from bookings.serializers import StaffBookingSerializer
from enquiries.models import ContactMessage, QuoteRequest

from .permissions import IsStaff
from .serializers import (
    StaffContactMessageSerializer,
    StaffCustomerSerializer,
    StaffPackageSerializer,
    StaffQuoteRequestSerializer,
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
        """Stamp the shipping dates when the status says they happened.

        Both are read-only over the API on purpose: they record when a thing
        actually happened, and deriving them from the status is what keeps
        them honest. Only ever set, never cleared — moving a package back a
        step is a correction, and forgetting it shipped at all would lose
        information the row already had.
        """
        package = serializer.instance
        status = serializer.validated_data.get("status", package.status)
        stamps = {}

        if status == Package.Status.IN_TRANSIT and package.shipped_at is None:
            stamps["shipped_at"] = timezone.now()
        if status == Package.Status.DELIVERED and package.delivered_at is None:
            stamps["delivered_at"] = timezone.now()

        serializer.save(**stamps)


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


class CustomerViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Everyone with an account, with their addresses and shipment counts.

    Read-only, unlike the other three: staff look a customer up to check a
    spelling or find who a package belongs to. Editing somebody's personal
    data is a heavier action than a list screen should offer, and Django's
    admin already does it properly.
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
