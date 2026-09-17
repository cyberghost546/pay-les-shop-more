"""Shipments as the warehouse floor sees them: scan, move along, flag problems.

Mounted at /api/staff/warehouse/shipments/ by staff/urls.py, behind
IsWarehouseOrStaff like the intake sheets.

What a worker may do here is narrow on purpose. They scan, measure, pack,
report damage, set a rack location and move a shipment through the warehouse
stages they are allowed to set. They do not change the customer-facing
status, the declared weight, the address or the invoice - those stay with the
office in staff/views.py, where the lock and the invoice rules live.

Every write goes through warehouse/operations.py, which checks permissions and
records the immutable activity row.
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Package, PackageEvent
from invoicing.pdf import invoice_number
from staff.permissions import IsWarehouseOrStaff, WarehouseRateThrottle

from . import operations
from .models import (
    IntakeSheet,
    PackageActivity,
    PackageDamageReport,
    PackageMeasurement,
    measurement_totals,
)
from .records import (
    ID_REGEX,
    DamageReportSerializer,
    MeasurementSerializer,
    PackagingSerializer,
    local_date,
    local_time,
    person,
)

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


def open_damage_q():
    return Exists(
        PackageDamageReport.objects.filter(
            package=OuterRef("pk"), resolution_status=PackageDamageReport.Resolution.OPEN
        )
    )


def with_flags(queryset):
    """Annotate whether each shipment has an open damage report."""
    return queryset.annotate(has_open_damage=open_damage_q())


def detail_queryset():
    """Shipments with everything the detail card reads, in a handful of queries."""
    return with_flags(
        Package.objects.select_related(
            "user", "delivery_address", "problem_reported_by", "invoice"
        ).prefetch_related(
            "intake_sheets__measurements",
            "warehouse_measurements__worker",
        )
    )


def attention_q(now=None):
    """Needs somebody: a problem flag, open damage, or waiting too long."""
    return ~Q(problem_note="") | Q(has_open_damage=True) | overdue_q(now)


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
    workflow_status = serializers.CharField(read_only=True)
    workflow_status_display = serializers.CharField(
        source="get_workflow_status_display", read_only=True
    )
    package_number = serializers.CharField(read_only=True)
    overdue = serializers.SerializerMethodField()
    has_problem = serializers.SerializerMethodField()
    has_open_damage = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "id",
            "package_number",
            "tracking_number",
            "customer",
            "destination",
            "description",
            "weight_kg",
            "warehouse_stage",
            "warehouse_stage_display",
            "warehouse_stage_at",
            "warehouse_location",
            "workflow_status",
            "workflow_status_display",
            "overdue",
            "has_problem",
            "problem_note",
            "has_open_damage",
        ]

    def get_customer(self, obj):
        return _person(obj.user)

    def get_overdue(self, obj):
        return obj.overdue_since is not None

    def get_has_problem(self, obj):
        return bool(obj.problem_note)

    def get_has_open_damage(self, obj):
        annotated = getattr(obj, "has_open_damage", None)
        if annotated is not None:
            return bool(annotated)
        return obj.damage_reports.filter(
            resolution_status=PackageDamageReport.Resolution.OPEN
        ).exists()


class ShipmentDetailSerializer(ShipmentRowSerializer):
    """Everything a worker needs after a scan, on one card."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    freight_display = serializers.CharField(source="get_freight_display", read_only=True)
    customer_phone = serializers.SerializerMethodField()
    problem_reported_by = serializers.SerializerMethodField()
    invoice = serializers.SerializerMethodField()
    intake = serializers.SerializerMethodField()
    order_number = serializers.SerializerMethodField()
    package_type = serializers.SerializerMethodField()
    measurement = serializers.SerializerMethodField()
    allowed_stages = serializers.SerializerMethodField()

    class Meta(ShipmentRowSerializer.Meta):
        fields = ShipmentRowSerializer.Meta.fields + [
            "order_number",
            "package_type",
            "freight",
            "freight_display",
            "status",
            "status_display",
            "customer_phone",
            "delivery_address_text",
            "received_at",
            "problem_reported_at",
            "problem_reported_by",
            "invoice",
            "intake",
            "measurement",
            "allowed_stages",
            "created_at",
        ]

    def _latest_sheet(self, obj):
        sheets = sorted(obj.intake_sheets.all(), key=lambda s: s.created_at, reverse=True)
        return sheets[0] if sheets else None

    def get_order_number(self, obj):
        """The reference the office bills and books this shipment under.

        Packages have no order column of their own; the invoice number is the
        order reference customers are sent, and an intake sheet's reference
        the one written on the paperwork when there is no invoice yet.
        """
        invoice = getattr(obj, "invoice", None)
        if invoice is not None:
            return invoice_number(invoice)
        sheet = self._latest_sheet(obj)
        return sheet.reference if sheet is not None and sheet.reference else ""

    def get_package_type(self, obj):
        """What the goods came as, from the intake sheet: pallet, box, crate."""
        sheet = self._latest_sheet(obj)
        if sheet is None or not sheet.packaging:
            return ""
        if sheet.packaging == IntakeSheet.Packaging.OTHER and sheet.packaging_other:
            return sheet.packaging_other
        return sheet.get_packaging_display()

    def get_measurement(self, obj):
        measurements = list(obj.warehouse_measurements.all())
        if not measurements:
            return None
        return MeasurementSerializer(measurements[0]).data | {"current": True}

    def get_allowed_stages(self, obj):
        request = self.context.get("request")
        if request is None:
            return []
        return list(operations.allowed_stages(request.user))

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
        sheet = self._latest_sheet(obj)
        if sheet is None:
            return None

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

    List filters: ?stage= (one, or several comma-separated), ?problem=true,
    ?overdue=true, ?damaged=true, ?attention=true, ?search=.
    """

    permission_classes = [IsWarehouseOrStaff]
    throttle_classes = [WarehouseRateThrottle]
    lookup_value_regex = ID_REGEX

    def get_queryset(self):
        queryset = detail_queryset()

        if self.action != "list":
            # A scan or a link must find any shipment, not only the ones on
            # the board - somebody holding an old box wants to know it is old.
            return queryset

        queryset = board_queryset(queryset)
        params = self.request.query_params

        stages = [value for value in params.get("stage", "").split(",") if value in Stage.values]
        if stages:
            queryset = queryset.filter(warehouse_stage__in=stages)
        if params.get("problem") == "true":
            queryset = queryset.exclude(problem_note="")
        if params.get("overdue") == "true":
            queryset = queryset.filter(overdue_q())
        if params.get("damaged") == "true":
            queryset = queryset.filter(has_open_damage=True)
        if params.get("attention") == "true":
            queryset = queryset.filter(attention_q())

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(tracking_number__icontains=search)
                | Q(description__icontains=search)
                | Q(warehouse_location__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
            )

        return queryset.order_by("warehouse_stage_at", "id")

    def get_serializer_class(self):
        return ShipmentRowSerializer if self.action in ("list", "board") else ShipmentDetailSerializer

    def _detail(self, package, status=http_status.HTTP_200_OK):
        # Re-read with the prefetches, so the answer to a write is the same
        # shape as a scan and carries what the write just changed.
        fresh = detail_queryset().get(pk=package.pk)
        return Response(
            ShipmentDetailSerializer(fresh, context={"request": self.request}).data,
            status=status,
        )

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """`?code=` - the shipment behind a scanned code, or 404. Writes nothing."""
        package = find_shipment(request.query_params.get("code"))
        if package is None:
            return Response({"detail": "No shipment has this code."}, status=404)
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def scanned(self, request, pk=None):
        """Record that a worker scanned this package and opened it. `code` optional."""
        package = self.get_object()
        operations.record_scan(package, request.user, str(request.data.get("code") or ""))
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def stage(self, request, pk=None):
        """Move to `stage`, if the caller's role may set it. See operations.change_stage."""
        package = self.get_object()
        operations.change_stage(package, request.data.get("stage"), request.user)
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def location(self, request, pk=None):
        """Set the rack or shelf the package sits on. `location`, blank to clear."""
        package = self.get_object()
        operations.set_location(package, request.user, request.data.get("location"))
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def problem(self, request, pk=None):
        """Flag a problem with `note`, or replace the note on one already flagged."""
        package = self.get_object()
        operations.report_problem(package, request.user, request.data.get("note"))
        return self._detail(package)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Clear the problem. The note stays on the history, not on the row."""
        package = self.get_object()
        operations.resolve_problem(package, request.user)
        return self._detail(package)

    @action(detail=True, methods=["get", "post"])
    def measurements(self, request, pk=None):
        """GET the measurement history, newest first. POST a new measurement.

        POST {weight_kg, length_cm, width_cm, height_cm}. The worker is the
        signed-in account; volume and dimensional weight are computed here.
        """
        package = self.get_object()
        if request.method == "POST":
            measurement, package = operations.save_measurement(package, request.user, request.data)
            response = self._detail(package, status=http_status.HTTP_201_CREATED)
            response.data = {
                "measurement": MeasurementSerializer(measurement).data,
                "shipment": response.data,
            }
            return response

        rows = package.warehouse_measurements.select_related("worker", "superseded_by")
        return Response(MeasurementSerializer(rows, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def packaging(self, request, pk=None):
        """GET the packaging records. POST {packaging_type, quantity, notes}."""
        package = self.get_object()
        if request.method == "POST":
            record = operations.add_packaging(package, request.user, request.data)
            response = self._detail(package, status=http_status.HTTP_201_CREATED)
            response.data = {
                "packaging": PackagingSerializer(record).data,
                "shipment": response.data,
            }
            return response

        rows = package.packaging_records.select_related("worker")
        return Response(PackagingSerializer(rows, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def damage(self, request, pk=None):
        """GET damage reports. POST multipart {damage_type, description, photos[]}."""
        package = self.get_object()
        if request.method == "POST":
            report = operations.report_damage(
                package, request.user, request.data, request.FILES.getlist("photos")
            )
            response = self._detail(package, status=http_status.HTTP_201_CREATED)
            response.data = {
                "damage_report": DamageReportSerializer(report).data,
                "shipment": response.data,
            }
            return response

        rows = package.damage_reports.select_related(
            "package__user", "worker", "resolved_by"
        ).prefetch_related("photos")
        return Response(DamageReportSerializer(rows, many=True).data)

    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        """The package's whole history, oldest first, as one timeline.

        The warehouse's own activity rows, plus the office's status changes
        from the order history, so the floor sees "In transit" land on the
        same line as their own work.
        """
        package = self.get_object()

        entries = [
            {
                "id": f"activity-{row.pk}",
                "source": "warehouse",
                "action": row.action,
                "action_display": row.get_action_display(),
                "description": row.description,
                "user": person(row.user),
                "timestamp": row.timestamp,
                "date": local_date(row.timestamp),
                "time": local_time(row.timestamp),
            }
            for row in package.activity.select_related("user").order_by("-timestamp", "-id")[:500]
        ]

        status_labels = dict(Package.Status.choices)
        for event in package.events.filter(kind=PackageEvent.Kind.STATUS_CHANGED).select_related(
            "actor"
        )[:200]:
            context = event.context or {}
            entries.append(
                {
                    "id": f"event-{event.pk}",
                    "source": "office",
                    "action": "shipment_status_changed",
                    "action_display": "Shipment status changed",
                    "description": " → ".join(
                        status_labels.get(value, value)
                        for value in (context.get("from_status"), context.get("to_status"))
                        if value
                    ),
                    "user": person(event.actor),
                    "timestamp": event.at,
                    "date": local_date(event.at),
                    "time": local_time(event.at),
                }
            )

        entries.sort(key=lambda entry: entry["timestamp"])
        return Response(entries)

    @action(detail=False, methods=["get"])
    def board(self, request):
        """The warehouse dashboard in one request: a card per stage and the alarms."""
        now = timezone.now()
        today = timezone.localdate()
        active = with_flags(board_queryset())

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
                # The warehouse dashboard's six headline numbers.
                "waiting_measurement": active.filter(
                    warehouse_stage__in=[Stage.RECEIVED, Stage.AWAITING_MEASUREMENT]
                ).count(),
                "measured_today": PackageMeasurement.objects.filter(
                    measured_at__date=today
                ).values("package").distinct().count(),
                "waiting_packaging": active.filter(
                    warehouse_stage__in=[Stage.MEASURED, Stage.AWAITING_PACKAGING]
                ).count(),
                "ready_for_shipment": active.filter(warehouse_stage=Stage.READY).count(),
                "damaged": Package.objects.filter(open_damage_q()).count(),
                "attention": active.filter(attention_q(now)).count(),
                "activity_today": PackageActivity.objects.filter(
                    timestamp__date=today, user=request.user
                ).count(),
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
