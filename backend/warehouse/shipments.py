"""Shipments as the warehouse floor sees them: scan, move along, flag problems.

Mounted at /api/staff/warehouse/shipments/ by staff/urls.py, behind
IsWarehouseOrStaff like the intake sheets.

What a worker may do here is narrow on purpose. They move a shipment through
the warehouse stages and they flag or clear a problem. They do not change the
customer-facing status, the weight, the address or the invoice - those stay
with the office in staff/views.py, where the lock and the invoice rules live.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.events import record_event
from accounts.models import Package, PackageEvent
from invoicing.pdf import invoice_number
from staff.permissions import IsWarehouseOrStaff

from .models import IntakeSheet, measurement_totals

Stage = Package.WarehouseStage

# How long a shipped shipment stays on the board. Long enough to answer "did
# that go out on Tuesday", short enough that the card does not count forever.
SHIPPED_WINDOW = timedelta(days=7)


def board_queryset(queryset=None):
    """The shipments the warehouse is responsible for right now.

    Quotes nobody has paid are not goods anybody is going to collect, and a
    cancelled shipment is nobody's work. Shipped ones drop off after a week.
    """
    queryset = Package.objects.all() if queryset is None else queryset
    return queryset.exclude(
        status__in=[Package.Status.QUOTED, Package.Status.CANCELLED]
    ).exclude(
        warehouse_stage=Stage.SHIPPED,
        warehouse_stage_at__lt=timezone.now() - SHIPPED_WINDOW,
    )


def detail_queryset():
    """Shipments with everything the detail card reads, in a handful of queries."""
    return Package.objects.select_related(
        "user", "delivery_address", "problem_reported_by", "invoice"
    ).prefetch_related("intake_sheets__measurements")


def overdue_q(now=None):
    """A filter for shipments that have sat in their stage past its limit."""
    now = now or timezone.now()
    condition = Q(pk__in=[])
    for stage, limit in Package.WAREHOUSE_STAGE_LIMITS.items():
        condition |= Q(warehouse_stage=stage, warehouse_stage_at__lte=now - limit)
    return condition


def find_shipment(code):
    """The shipment a scanned code belongs to, or None.

    The tracking number first. Failing that, an intake sheet written under
    this code that has been linked to a shipment - the reference on the box
    is often the sheet's, not the carrier's.
    """
    code = (code or "").strip()
    if not code:
        return None

    package = Package.objects.filter(tracking_number__iexact=code).first()
    if package is not None:
        return package

    sheet = (
        IntakeSheet.objects.filter(reference__iexact=code, package__isnull=False)
        .order_by("-created_at")
        .first()
    )
    return sheet.package if sheet is not None else None


def _person(user):
    if user is None:
        return ""
    return user.get_full_name() or user.email


class ShipmentRowSerializer(serializers.ModelSerializer):
    """One line in a list on the board: enough to recognise the box."""

    customer = serializers.SerializerMethodField()
    destination = serializers.CharField(source="destination_label", read_only=True)
    warehouse_stage_display = serializers.CharField(
        source="get_warehouse_stage_display", read_only=True
    )
    overdue = serializers.SerializerMethodField()
    has_problem = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "id",
            "tracking_number",
            "customer",
            "destination",
            "description",
            "weight_kg",
            "warehouse_stage",
            "warehouse_stage_display",
            "warehouse_stage_at",
            "overdue",
            "has_problem",
            "problem_note",
        ]

    def get_customer(self, obj):
        return _person(obj.user)

    def get_overdue(self, obj):
        return obj.overdue_since is not None

    def get_has_problem(self, obj):
        return bool(obj.problem_note)


class ShipmentDetailSerializer(ShipmentRowSerializer):
    """Everything a worker needs after a scan, on one card."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_phone = serializers.SerializerMethodField()
    problem_reported_by = serializers.SerializerMethodField()
    invoice = serializers.SerializerMethodField()
    intake = serializers.SerializerMethodField()

    class Meta(ShipmentRowSerializer.Meta):
        fields = ShipmentRowSerializer.Meta.fields + [
            "status",
            "status_display",
            "customer_phone",
            "delivery_address_text",
            "received_at",
            "problem_reported_at",
            "problem_reported_by",
            "invoice",
            "intake",
            "created_at",
        ]

    def get_customer_phone(self, obj):
        return obj.user.phone_number if obj.user else ""

    def get_problem_reported_by(self, obj):
        return _person(obj.problem_reported_by)

    def get_invoice(self, obj):
        # Reverse OneToOne: a missing invoice raises RelatedObjectDoesNotExist,
        # which is an AttributeError, so getattr's default catches it.
        invoice = getattr(obj, "invoice", None)
        if invoice is None:
            return None
        return {
            "id": invoice.id,
            "number": invoice_number(invoice),
            "status": invoice.status,
            "status_display": invoice.get_status_display(),
            "sent_at": invoice.sent_at,
        }

    def get_intake(self, obj):
        """The latest intake sheet: products counted, measured, and how it goes.

        The shipment itself carries a description and a declared weight and
        nothing about freight or what is in the boxes; the sheet is where the
        warehouse wrote those down.
        """
        sheets = sorted(obj.intake_sheets.all(), key=lambda s: s.created_at, reverse=True)
        if not sheets:
            return None

        sheet = sheets[0]
        lines = list(sheet.measurements.all())
        totals = measurement_totals(lines)

        return {
            "id": sheet.id,
            "label": sheet.label,
            "status": sheet.status,
            "status_display": sheet.get_status_display(),
            "freight": sheet.freight,
            "freight_display": sheet.get_freight_display() if sheet.freight else "",
            "colli": totals["colli"] if lines else sheet.colli_count,
            "volume_m3": str(totals["volume_m3"]) if totals["volume_m3"] is not None else None,
            "weight_kg": str(totals["weight_kg"]) if totals["weight_kg"] is not None else None,
            "lines": [
                {
                    "quantity": line.quantity,
                    "packaging": line.get_packaging_display() if line.packaging else "",
                    "length_cm": line.length_cm,
                    "width_cm": line.width_cm,
                    "height_cm": line.height_cm,
                    "weight_kg": line.weight_kg,
                    "note": line.note,
                }
                for line in lines
            ],
        }


class ShipmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """The warehouse's shipments. Read, move along a stage, flag a problem.

    List filters: ?stage=, ?problem=true, ?overdue=true, ?search=.
    """

    permission_classes = [IsWarehouseOrStaff]

    def get_queryset(self):
        queryset = detail_queryset()

        if self.action != "list":
            # A scan or a link must find any shipment, not only the ones on
            # the board - somebody holding an old box wants to know it is old.
            return queryset

        queryset = board_queryset(queryset)
        params = self.request.query_params

        stage = params.get("stage")
        if stage in Stage.values:
            queryset = queryset.filter(warehouse_stage=stage)
        if params.get("problem") == "true":
            queryset = queryset.exclude(problem_note="")
        if params.get("overdue") == "true":
            queryset = queryset.filter(overdue_q())

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(tracking_number__icontains=search)
                | Q(description__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
            )

        return queryset.order_by("warehouse_stage_at")

    def get_serializer_class(self):
        return ShipmentRowSerializer if self.action in ("list", "board") else ShipmentDetailSerializer

    def _detail(self, package):
        # Re-read with the prefetches, so the answer to a write is the same
        # shape as a scan and carries what the write just changed.
        return Response(ShipmentDetailSerializer(self.get_queryset().get(pk=package.pk)).data)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """`?code=` - the shipment behind a scanned code, or 404."""
        package = find_shipment(request.query_params.get("code"))
        if package is None:
            return Response({"detail": "No shipment has this code."}, status=404)
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def stage(self, request, pk=None):
        """Move to `stage`. Either direction: the floor corrects its own mistakes."""
        package = self.get_object()
        to_stage = request.data.get("stage")

        if to_stage not in Stage.values:
            raise ValidationError({"stage": ["Not a warehouse stage."]})
        if package.status == Package.Status.CANCELLED:
            raise ValidationError({"stage": ["This shipment was cancelled."]})

        from_stage = package.warehouse_stage
        if to_stage == from_stage:
            return self._detail(package)

        now = timezone.now()
        package.warehouse_stage = to_stage
        package.warehouse_stage_at = now
        fields = ["warehouse_stage", "warehouse_stage_at", "updated_at"]

        # Stamped the first time it is received in any form - a box that goes
        # straight to "packed" from the counter was still received today.
        if to_stage != Stage.AWAITING_PICKUP and package.received_at is None:
            package.received_at = now
            fields.append("received_at")

        with transaction.atomic():
            package.save(update_fields=fields)
            record_event(
                package,
                PackageEvent.Kind.WAREHOUSE_STAGE_CHANGED,
                actor=request.user,
                from_stage=from_stage,
                to_stage=to_stage,
            )

        return self._detail(package)

    @action(detail=True, methods=["post"])
    def problem(self, request, pk=None):
        """Flag a problem with `note`, or replace the note on one already flagged."""
        package = self.get_object()
        note = (request.data.get("note") or "").strip()

        if not note:
            raise ValidationError({"note": ["Say what the problem is."]})
        if len(note) > 500:
            raise ValidationError({"note": ["Keep it under 500 characters."]})

        package.problem_note = note
        package.problem_reported_at = timezone.now()
        package.problem_reported_by = request.user

        with transaction.atomic():
            package.save(
                update_fields=[
                    "problem_note", "problem_reported_at", "problem_reported_by", "updated_at"
                ]
            )
            record_event(
                package, PackageEvent.Kind.PROBLEM_REPORTED, actor=request.user, note=note
            )

        return self._detail(package)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Clear the problem. The note stays on the history, not on the row."""
        package = self.get_object()

        if not package.problem_note:
            return self._detail(package)

        note = package.problem_note
        package.problem_note = ""
        package.problem_reported_at = None
        package.problem_reported_by = None

        with transaction.atomic():
            package.save(
                update_fields=[
                    "problem_note", "problem_reported_at", "problem_reported_by", "updated_at"
                ]
            )
            record_event(
                package, PackageEvent.Kind.PROBLEM_RESOLVED, actor=request.user, note=note
            )

        return self._detail(package)

    @action(detail=False, methods=["get"])
    def board(self, request):
        """The warehouse dashboard in one request: a card per stage and the alarms."""
        now = timezone.now()
        today = timezone.localdate()
        active = board_queryset()

        def count_by_stage(queryset):
            # order_by() cleared, so the model's default ordering cannot sneak
            # into the GROUP BY and split the counts.
            rows = queryset.order_by().values("warehouse_stage").annotate(n=Count("id"))
            return {row["warehouse_stage"]: row["n"] for row in rows}

        per_stage = count_by_stage(active)
        overdue_per_stage = count_by_stage(active.filter(overdue_q(now)))

        received_today = Package.objects.filter(received_at__date=today)
        weight_today = received_today.aggregate(total=Sum("weight_kg"))["total"]

        overdue = active.filter(overdue_q(now)).select_related("user", "delivery_address")
        problems = active.exclude(problem_note="").select_related("user", "delivery_address")

        return Response(
            {
                "stages": [
                    {
                        "stage": value,
                        "label": label,
                        "count": per_stage.get(value, 0),
                        "overdue": overdue_per_stage.get(value, 0),
                    }
                    for value, label in Stage.choices
                ],
                "problems": problems.count(),
                "overdue": overdue.count(),
                "today": {
                    "packages": received_today.count(),
                    # Quantized, because SQLite and Postgres disagree on the
                    # scale of a SUM over a decimal column.
                    "weight_kg": str(
                        Decimal(weight_today or 0).quantize(Decimal("0.01"))
                    ),
                },
                "overdue_list": ShipmentRowSerializer(
                    overdue.order_by("warehouse_stage_at")[:5], many=True
                ).data,
                "problem_list": ShipmentRowSerializer(
                    problems.order_by("-problem_reported_at")[:5], many=True
                ).data,
            }
        )
