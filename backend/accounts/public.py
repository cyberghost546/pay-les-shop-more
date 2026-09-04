"""Endpoints anyone on the internet may call, without an account.

Two of them, both read-only and both feeding the homepage: looking up one
shipment by its tracking number, and the counts in the statistics band.

The rule that shapes this whole module: a tracking number is an identifier,
not a credential. It is printed on paperwork, forwarded in e-mails and read
out over the phone, and it is short enough to guess at. So what comes back
here is the least that is still useful — where the package is in its journey
and which island it is going to — and never who is receiving it, where they
live, or what is inside.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from enquiries.models import QuoteRequest

from .models import Package

User = get_user_model()

# The stages a customer is shown, in order, so the tracking page can draw the
# timeline with everything before the current stage marked done. Cancelled is
# not here: it is not a stage on the way to anywhere.
PUBLIC_STAGES = [
    Package.Status.PAID,
    Package.Status.PURCHASED,
    Package.Status.IN_TRANSIT,
    Package.Status.ARRIVED,
    Package.Status.DELIVERED,
]


class PublicPackageSerializer(serializers.ModelSerializer):
    """What an anonymous caller may see about a shipment.

    Every field is listed by hand, and the list is short on purpose. Building
    this from `exclude` would quietly start publishing the delivery address
    the day somebody reordered the model.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    destination = serializers.CharField(source="destination_label", read_only=True)
    progress = serializers.IntegerField(read_only=True)
    stage_index = serializers.SerializerMethodField()
    stages = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "tracking_number",
            "status",
            "status_display",
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
        return [
            {"value": value, "label": Package.Status(value).label}
            for value in PUBLIC_STAGES
        ]

    def get_stage_index(self, obj):
        """Which stage the shipment is at, or -1 when it is not on the list.

        Quoted and cancelled both land on -1: one has not started, the other
        stopped, and neither is a point on the timeline.
        """
        try:
            return PUBLIC_STAGES.index(obj.status)
        except ValueError:
            return -1


class TrackingView(APIView):
    """GET /api/track/<tracking_number>/ — one shipment, minimal detail.

    404 for an unknown number, which is also what a guess gets. Throttled
    tightly: without that, this is a way to walk the tracking-number space and
    learn how many shipments exist and where they are going.
    """

    permission_classes = [AllowAny]
    throttle_scope = "tracking"
    throttle_classes = [ScopedRateThrottle]

    def get(self, request, tracking_number):
        package = (
            Package.objects.select_related("delivery_address")
            # Case-insensitive and trimmed, because this is typed in by hand
            # from a label or an e-mail, often with a stray space.
            .filter(tracking_number__iexact=tracking_number.strip())
            .first()
        )

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
