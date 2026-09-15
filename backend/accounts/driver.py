"""The driver's API: what is waiting to be delivered, and marking it delivered.

Mounted at /api/driver/deliveries/. Drivers and office accounts only.

A driver sees shipments that have arrived at their destination and not yet
been delivered, with what they need to hand one over - the customer's name,
phone number and delivery address - and nothing about invoices or contents.
Marking one delivered goes through the same rules as the office's status
change: Package.check_transition, delivered_at, the order history, and the
customer's notification.
"""

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, serializers, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from notifications.services import notify_shipment_status
from staff.permissions import IsDriverOrStaff

from .events import record_event
from .models import DeliveryConfirmation, Package, PackageEvent

PHOTO_MAX_BYTES = 10 * 1024 * 1024


class DeliveryConflict(APIException):
    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This shipment cannot be marked delivered."


def _sniff_image(upload):
    head = upload.read(16)
    upload.seek(0)
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None, None


class DeliverySerializer(serializers.ModelSerializer):
    package_number = serializers.CharField(read_only=True)
    customer = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    destination = serializers.CharField(source="destination_label", read_only=True)
    delivered = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "id",
            "package_number",
            "tracking_number",
            "customer",
            "customer_phone",
            "delivery_address_text",
            "destination",
            "estimated_arrival",
            "status",
            "delivered_at",
            "delivered",
        ]
        read_only_fields = fields

    def get_customer(self, obj):
        return (obj.user.get_full_name() or obj.user.email) if obj.user else ""

    def get_customer_phone(self, obj):
        return obj.user.phone_number if obj.user else ""

    def get_delivered(self, obj):
        confirmation = getattr(obj, "delivery_confirmation", None)
        if confirmation is None:
            return None
        return {
            "recipient_name": confirmation.recipient_name,
            "note": confirmation.note,
            "has_photo": bool(confirmation.photo),
            "driver": confirmation.driver.get_full_name() or confirmation.driver.email,
            "time": timezone.localtime(confirmation.delivered_at).strftime("%H:%M"),
        }


class DeliveryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """?view=today lists what this account delivered today; the default is
    everything waiting for delivery. ?search= matches tracking number,
    customer or address."""

    permission_classes = [IsDriverOrStaff]
    serializer_class = DeliverySerializer
    lookup_value_regex = r"[0-9]+"

    def get_queryset(self):
        queryset = Package.objects.select_related(
            "user", "delivery_address", "delivery_confirmation__driver"
        )

        if self.action != "list":
            return queryset

        params = self.request.query_params
        if params.get("view") == "today":
            queryset = queryset.filter(
                delivery_confirmation__driver=self.request.user,
                delivery_confirmation__delivered_at__date=timezone.localdate(),
            ).order_by("-delivery_confirmation__delivered_at")
        else:
            queryset = queryset.filter(status=Package.Status.ARRIVED).order_by(
                "estimated_arrival", "id"
            )

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(tracking_number__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(delivery_address_text__icontains=search)
            )
        return queryset

    @action(detail=True, methods=["post"])
    def deliver(self, request, pk=None):
        """Mark delivered. multipart: recipient_name (required), note, photo."""
        package = self.get_object()

        recipient = str(request.data.get("recipient_name") or "").strip()
        note = str(request.data.get("note") or "").strip()
        errors = {}
        if not recipient:
            errors["recipient_name"] = ["Who took the package?"]
        elif len(recipient) > 150:
            errors["recipient_name"] = ["Keep the name under 150 characters."]
        if len(note) > 500:
            errors["note"] = ["Keep the note under 500 characters."]

        photo = request.FILES.get("photo")
        content_type = extension = ""
        if photo is not None:
            if photo.size > PHOTO_MAX_BYTES:
                errors["photo"] = ["The photo must be 10 MB or smaller."]
            else:
                content_type, extension = _sniff_image(photo)
                if content_type is None:
                    errors["photo"] = ["The photo must be a JPEG, PNG or WebP image."]
        if errors:
            raise ValidationError(errors)

        if package.status != Package.Status.ARRIVED:
            raise DeliveryConflict(
                f"This shipment is {package.get_status_display().lower()}, not waiting "
                "for delivery."
            )

        with transaction.atomic():
            # Locked, so two drivers pressing Delivered at once make one delivery.
            package = Package.objects.select_for_update().get(pk=package.pk)
            if package.status != Package.Status.ARRIVED:
                raise DeliveryConflict("This shipment has just been marked delivered by someone else.")

            previous = package.status
            now = timezone.now()
            package.check_transition(Package.Status.DELIVERED)
            package.status = Package.Status.DELIVERED
            package.delivered_at = package.delivered_at or now
            package.save(update_fields=["status", "delivered_at", "updated_at"])

            confirmation = DeliveryConfirmation(
                package=package,
                driver=request.user,
                recipient_name=recipient,
                note=note,
                photo_content_type=content_type or "",
                delivered_at=now,
            )
            if photo is not None:
                confirmation.photo.save(f"delivery{extension}", photo, save=False)
            confirmation.save()

            record_event(
                package,
                PackageEvent.Kind.STATUS_CHANGED,
                actor=request.user,
                from_status=previous,
                to_status=package.status,
                recipient=recipient,
            )
            notify_shipment_status(package, previous)

        fresh = self.get_queryset().get(pk=package.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=True, methods=["get"])
    def photo(self, request, pk=None):
        """The delivery photo, for the driver and the office. 404 when none."""
        package = self.get_object()
        confirmation = getattr(package, "delivery_confirmation", None)
        if confirmation is None or not confirmation.photo:
            raise Http404("No delivery photo.")
        try:
            handle = confirmation.photo.open("rb")
        except FileNotFoundError:
            raise Http404("The delivery photo is missing.")
        return FileResponse(handle, content_type=confirmation.photo_content_type or "image/jpeg")
