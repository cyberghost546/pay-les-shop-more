"""Two views of a booking: the customer's half, and the office's whole.

The split is the point. BookingSerializer accepts exactly the fields a sender
fills in — so a crafted request cannot set its own shipping number, weigh its
own consignment, or mark its own packing as good.
"""

from django.utils import timezone
from rest_framework import serializers

from .models import Booking

# What the sender fills in. Listed by hand: built from `exclude`, this would
# start accepting `status` the day somebody added a field to the model.
SENDER_FIELDS = [
    "freight",
    "destination",
    "destination_other",
    "sender_first_name",
    "sender_last_name",
    "sender_address",
    "sender_postal_code",
    "sender_city",
    "sender_phone",
    "sender_email",
    "recipient_first_name",
    "recipient_last_name",
    "recipient_address",
    "recipient_city",
    "recipient_phone",
    "recipient_email",
    "packing",
    "payment",
    "quantity",
    "unit",
    "contents",
    "contents_attached",
    "value_eur",
    "vehicle",
    "emigration",
    "id_present",
    "deregistered",
    "deregistration_present",
    "insured",
    "insured_value_eur",
    "notes",
    "signature_name",
    "agreed_terms",
    "language",
]

# What only the counter fills in.
OFFICE_FIELDS = [
    "shipping_number",
    "status",
    "volume_m3",
    "weight_kg",
    "packing_quality",
    "office_notes",
]


class BookingSerializer(serializers.ModelSerializer):
    """The public form. Write-only in practice: nothing reads bookings back
    out over the public API, so a bug here cannot leak one."""

    class Meta:
        model = Booking
        fields = SENDER_FIELDS
        extra_kwargs = {
            "contents": {"required": False, "allow_blank": True},
            "notes": {"required": False, "allow_blank": True},
            "recipient_email": {"required": False, "allow_blank": True},
            "destination_other": {"required": False, "allow_blank": True},
            "language": {"required": False, "allow_blank": True},
        }

    def validate_agreed_terms(self, value):
        """The whole form is an agreement; without this it is just a list."""
        if not value:
            raise serializers.ValidationError(
                "The terms and conditions have to be accepted to place a booking."
            )
        return value

    def validate_signature_name(self, value):
        name = value.strip()
        if len(name) < 3:
            raise serializers.ValidationError("Please type your full name to sign.")
        return name

    def validate_value_eur(self, value):
        if value < 0:
            raise serializers.ValidationError("The value cannot be negative.")
        return value

    def validate(self, attrs):
        errors = {}

        # "Overig" is only a destination once it says where.
        if attrs.get("destination") == Booking.Destination.OTHER:
            if not attrs.get("destination_other", "").strip():
                errors["destination_other"] = "Please say which destination."
        else:
            attrs["destination_other"] = ""

        # An insured shipment needs a figure to insure; an uninsured one must
        # not carry a stale one from a half-filled form.
        if attrs.get("insured"):
            if attrs.get("insured_value_eur") in (None, ""):
                errors["insured_value_eur"] = "Please give the value to insure."
        else:
            attrs["insured_value_eur"] = None

        # The four emigration boxes only mean anything alongside an emigration,
        # so they are cleared rather than stored as stray yeses.
        if not attrs.get("emigration"):
            attrs["id_present"] = False
            attrs["deregistered"] = False
            attrs["deregistration_present"] = False

        # Nothing to describe the consignment by is not a booking anyone can
        # act on: either a list, or a note that one is coming separately.
        if not attrs.get("contents", "").strip() and not attrs.get("contents_attached"):
            errors["contents"] = (
                "Describe the contents, or tick that a list follows separately."
            )

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        # Stamped by the server, not sent by the browser: the time a signature
        # was given is not something the signer gets to choose.
        validated_data["signed_at"] = timezone.now()
        return super().create(validated_data)


class StaffBookingSerializer(serializers.ModelSerializer):
    """The whole form, for the dashboard.

    Only the office half is writable. What the sender put on the form is a
    record of what they declared — the value especially, which customs uses to
    charge duty — and is not the office's to edit afterwards.
    """

    destination_label = serializers.CharField(read_only=True)
    sender_name = serializers.CharField(read_only=True)
    recipient_name = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    freight_display = serializers.CharField(source="get_freight_display", read_only=True)
    packing_display = serializers.CharField(source="get_packing_display", read_only=True)
    payment_display = serializers.CharField(source="get_payment_display", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)
    vehicle_display = serializers.CharField(source="get_vehicle_display", read_only=True)

    class Meta:
        model = Booking
        fields = (
            ["id"]
            + OFFICE_FIELDS
            + SENDER_FIELDS
            + [
                "destination_label",
                "sender_name",
                "recipient_name",
                "status_display",
                "freight_display",
                "packing_display",
                "payment_display",
                "unit_display",
                "vehicle_display",
                "signed_at",
                "created_at",
                "updated_at",
            ]
        )
        read_only_fields = [
            field for field in fields if field not in OFFICE_FIELDS
        ]
