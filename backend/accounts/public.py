"""What the public site reads about shipments.

Two endpoints, both read-only: looking up one shipment by its tracking
number, and the counts in the homepage's statistics band. The counts are
open to anyone; the lookup takes a signed-in customer.

The rule that shapes this whole module: a tracking number is an identifier,
not a credential. It is printed on paperwork, forwarded in e-mails and read
out over the phone, and it is short enough to guess at. So holding one is not
enough to follow a shipment - the lookup only finds the caller's own - and
what comes back is still the least that is useful: where the package is in
its journey and which island it is going to, never who is receiving it,
where they live, or what is inside.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from enquiries.models import QuoteRequest

from .models import Package

User = get_user_model()

# The stages a customer is shown, in order, so the tracking page can draw the
# timeline with everything before the current stage marked done. Cancelled is
# not here: it is not a stage on the way to anywhere.
# The journey as a customer sees it: the office's statuses, with the warehouse's
# own steps filled in between "purchased" and "in transit". Only progress is
# shown - never damage, problems, locations or who did the work.
PUBLIC_STAGES = [
    (Package.Status.PAID, "Paid"),
    (Package.Status.PURCHASED, "Products purchased"),
    ("received", "Received at our warehouse"),
    ("measured", "Weighed and measured"),
    ("packed", "Packed"),
    (Package.Status.READY_FOR_SHIPPING, "Ready for shipping"),
    (Package.Status.IN_TRANSIT, "In transit"),
    (Package.Status.ARRIVED, "Arrived at destination"),
    (Package.Status.DELIVERED, "Delivered"),
]
_STAGE_VALUES = [value for value, _ in PUBLIC_STAGES]

_Stage = Package.WarehouseStage
# Where each warehouse stage puts a package on the public timeline.
_WAREHOUSE_TO_PUBLIC = {
    _Stage.RECEIVED: "received",
    _Stage.AWAITING_MEASUREMENT: "received",
    _Stage.MEASURED: "measured",
    _Stage.AWAITING_PACKAGING: "measured",
    _Stage.PACKED: "packed",
    _Stage.READY: Package.Status.READY_FOR_SHIPPING,
    _Stage.SHIPPED: Package.Status.IN_TRANSIT,
}


def public_stage_index(package):
    """How far along the public timeline a package is, or -1 if not on it.

    The furthest of what the office's status says and what the warehouse's
    stage says: the two are updated by different people, and whichever has
    moved on is the truth about where the package is. Quoted and cancelled
    are not on the timeline at all.
    """
    if package.status not in _STAGE_VALUES:
        return -1
    index = _STAGE_VALUES.index(package.status)
    step = _WAREHOUSE_TO_PUBLIC.get(package.warehouse_stage)
    if step is not None:
        index = max(index, _STAGE_VALUES.index(step))
    return index


class PublicPackageSerializer(serializers.ModelSerializer):
    """What the tracking page may show about a shipment.

    Every field is listed by hand, and the list is short on purpose. Building
    this from `exclude` would quietly start publishing the delivery address
    the day somebody reordered the model.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    destination = serializers.CharField(source="destination_label", read_only=True)
    progress = serializers.IntegerField(read_only=True)
    stage_index = serializers.SerializerMethodField()
    stages = serializers.SerializerMethodField()
    # Safe to publish, and the reason the tracking page can say "this one has
    # gone" without the visitor having to know which statuses mean that. The
    # sentence itself is not sent: the React app has it in three languages,
    # and lock_reason is English. See Package.locked.
    locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Package
        fields = [
            "tracking_number",
            "status",
            "status_display",
            "locked",
            "destination",
            "progress",
            "stage_index",
            "stages",
            "shipped_at",
            "delivered_at",
            "estimated_arrival",
        ]
        read_only_fields = fields

    def get_stages(self, obj):
        return [{"value": value, "label": label} for value, label in PUBLIC_STAGES]

    def get_stage_index(self, obj):
        """Which stage the shipment is at, or -1 when it is not on the list.

        Quoted and cancelled both land on -1: one has not started, the other
        stopped, and neither is a point on the timeline.
        """
        return public_stage_index(obj)


class TrackingView(APIView):
    """GET /api/track/<tracking_number>/ — one of the caller's shipments.

    Signed in only, and only the caller's own shipments: until it was, anyone
    with a tracking number - or a lucky guess at one - could follow somebody
    else's parcel. The office can look up any shipment, as it can every
    customer's paperwork.

    404 for an unknown number, and the same 404 for somebody else's, so the
    answer does not confirm that a number exists. Still throttled: a customer
    refreshing their own shipment needs nowhere near the limit.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "tracking"
    throttle_classes = [ScopedRateThrottle]

    def get(self, request, tracking_number):
        packages = Package.objects.select_related("delivery_address")
        # Narrowed before the number is looked at, so somebody else's
        # shipment is never found at all rather than found and then refused.
        if not request.user.is_staff:
            packages = packages.filter(user=request.user)

        # Case-insensitive and trimmed, because this is typed in by hand from
        # a label or an e-mail, often with a stray space.
        package = packages.filter(
            tracking_number__iexact=tracking_number.strip()
        ).first()

        if package is None:
            return Response(
                {"detail": "No shipment found with that tracking number."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(PublicPackageSerializer(package).data)


class SiteStatsView(APIView):
    """GET /api/stats/ — the numbers behind the homepage statistics band.

    Real counts, not decoration. They start small, and that is the point: a
    figure on a public page is a claim, and one nobody has to stand behind is
    worth less than a small true one.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        packages = Package.objects.all()

        # Anonymised rows are erased customers whose shipment records had to
        # be kept; counting them would overstate the business.
        customers = User.objects.filter(is_active=True, anonymised_at__isnull=True)

        by_status = packages.aggregate(
            delivered=Count("id", filter=Q(status=Package.Status.DELIVERED)),
            in_transit=Count("id", filter=Q(status=Package.Status.IN_TRANSIT)),
            total=Count("id"),
        )

        # Islands actually shipped to, from the addresses packages went to —
        # not the length of the country list we would be willing to serve.
        destinations = (
            packages.exclude(delivery_address__isnull=True)
            .values("delivery_address__country")
            .distinct()
            .count()
        )

        return Response(
            {
                "packages_delivered": by_status["delivered"],
                "packages_in_transit": by_status["in_transit"],
                "packages_total": by_status["total"],
                "destinations": destinations,
                "customers": customers.count(),
                "quotes_handled": QuoteRequest.objects.filter(
                    status__in=[QuoteRequest.Status.QUOTED, QuoteRequest.Status.ACCEPTED]
                ).count(),
            }
        )
