"""The intake sheet over the wire, and what "finished" means for one.

Two jobs live here. The serializer is the ordinary one; `missing_for_release`
is the interesting one, and it is the reason a sheet has a draft state at all.
"""

from django.db import transaction
from rest_framework import serializers

from .models import IntakeSheet, Measurement, measurement_totals

# What has to be filled in before a sheet may be handed over.
#
# Deliberately short. Every field on the form matters to somebody, but a list
# that demands all of them is a list people work around - they type a dot in
# the box to get past it, and the sheet is then worse than one with an honest
# gap. These are the answers without which the office cannot start: when the
# goods arrived, how many there are, how they are going, and where.
REQUIRED_FOR_RELEASE = {
    "received_on": "Datum aanname goederen",
    "colli_count": "Aantal colli",
    "freight": "Transportwijze",
    "destination": "Bestemming",
}

# The three Ja / Nee boxes. Kept apart from the list above because blank is a
# real state for them rather than an empty string that means nothing - and
# because "nobody checked for damage" is exactly what must not travel quietly
# to the office as part of a finished sheet.
REQUIRED_CHECKS = {
    "packed_well": "Goed ingepakt?",
    "damage_present": "Schade aanwezig?",
    "address_label_present": "Adreslabel aanwezig?",
}


def missing_for_release(sheet):
    """The labels of everything still unanswered on a sheet, in form order.

    Returns a list, empty when the sheet is ready. A list rather than a
    boolean so the dashboard can name the boxes instead of saying "incomplete"
    and leaving somebody to hunt down a form with thirty fields on it.
    """
    missing = [
        label
        for field, label in REQUIRED_FOR_RELEASE.items()
        if getattr(sheet, field) in (None, "")
    ]

    missing += [
        label for field, label in REQUIRED_CHECKS.items() if not getattr(sheet, field)
    ]

    # Verpakking counts as answered either by a choice or, for "anders", by
    # the words written on the line after it.
    if not sheet.packaging:
        missing.append("Verpakking")
    elif sheet.packaging == IntakeSheet.Packaging.OTHER and not sheet.packaging_other:
        missing.append("Verpakking (anders)")

    # At least one line with all four numbers on it. The office prices a
    # shipment from these, and a sheet that says "4 colli" and nothing about
    # their size is a phone call back to the warehouse.
    if not any(line.complete for line in sheet.measurements.all()):
        missing.append("Afmetingen & gewicht")

    return missing


class ScannedPackageSerializer(serializers.Serializer):
    """The little a scanner needs to show about a shipment it recognised.

    Enough to confirm the right box is in front of you - the tracking number
    and whose it is - and no more. This is read on a phone held in one hand,
    and it is read to answer one question: start the intake, or scan again.
    """

    id = serializers.IntegerField(read_only=True)
    tracking_number = serializers.CharField(read_only=True)
    destination = serializers.CharField(source="destination_label", read_only=True)
    customer = serializers.SerializerMethodField()

    def get_customer(self, obj):
        user = obj.user
        return user.get_full_name() or user.email if user else ""


class ScannedBookingSerializer(serializers.Serializer):
    """The same, for a booking form somebody filled in on the website."""

    id = serializers.IntegerField(read_only=True)
    shipping_number = serializers.CharField(read_only=True)
    destination = serializers.CharField(source="destination_label", read_only=True)
    sender = serializers.CharField(source="sender_name", read_only=True)
    recipient = serializers.CharField(source="recipient_name", read_only=True)


class MeasurementSerializer(serializers.ModelSerializer):
    """One measured line, with what it works out to."""

    volume_m3 = serializers.DecimalField(
        max_digits=10, decimal_places=3, read_only=True
    )
    total_weight_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = Measurement
        fields = [
            "id",
            "quantity",
            "packaging",
            "length_cm",
            "width_cm",
            "height_cm",
            "weight_kg",
            "note",
            "complete",
            "volume_m3",
            "total_weight_kg",
        ]
        read_only_fields = ["id"]


class IntakeSheetSerializer(serializers.ModelSerializer):
    """One sheet, as the dashboard reads and writes it.

    Everything about the handover itself is read-only here. Releasing is a
    state change with an e-mail hanging off it, not a field somebody can PATCH
    to "released" - see the release action on the viewset.
    """

    # The Dutch words the form prints, so the dashboard does not keep its own
    # copy of a list the model already owns.
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    freight_display = serializers.CharField(
        source="get_freight_display", read_only=True
    )
    packaging_display = serializers.CharField(
        source="get_packaging_display", read_only=True
    )

    label = serializers.CharField(read_only=True)
    released = serializers.BooleanField(read_only=True)

    created_by_name = serializers.SerializerMethodField()
    released_by_name = serializers.SerializerMethodField()

    # What the Release button needs to know before it is pressed, computed on
    # the server so the browser and the server cannot disagree about whether a
    # sheet is finished.
    missing = serializers.SerializerMethodField()

    # The measured lines, written as a whole list: what is sent replaces what
    # was there. A sheet has a handful of lines at most, and a list the form
    # sends back complete cannot drift out of step with the one on screen the
    # way a row-by-row API can when a save fails halfway.
    measurements = MeasurementSerializer(many=True, required=False)
    totals = serializers.SerializerMethodField()
    # What the linked shipment says it weighs, for the office to hold against
    # what the scale said. Shown side by side and never overwritten - which
    # one to bill is somebody's decision, not this serializer's.
    declared_weight_kg = serializers.DecimalField(
        source="package.weight_kg",
        max_digits=8,
        decimal_places=3,
        read_only=True,
        default=None,
    )

    class Meta:
        model = IntakeSheet
        fields = [
            "id",
            "status",
            "status_display",
            "label",
            "released",
            "missing",
            "reference",
            # Ophalen
            "pickup",
            "upper_floor",
            "employees",
            "pickup_location",
            "received_on",
            # Inpakken
            "packing_required",
            "pallet_box",
            "volume_m3",
            # Checks
            "packed_well",
            "damage_present",
            "address_label_present",
            "check_notes",
            # Consignment
            "supplier",
            "sender",
            "destination",
            "recipient",
            "notes",
            # Goods
            "colli_count",
            "packaging",
            "packaging_display",
            "packaging_other",
            "dimensions_weight",
            "measurements",
            "totals",
            "declared_weight_kg",
            "freight",
            "freight_display",
            "employee_name",
            # Links
            "booking",
            "package",
            # Provenance
            "created_by_name",
            "released_by_name",
            "released_at",
            "emailed_at",
            "revision",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "released_at",
            "emailed_at",
            "revision",
            "created_at",
            "updated_at",
            # The signature at the bottom of the form. Read-only here rather
            # than merely defaulted: it is whoever is signed in, and a box
            # somebody can type another name into is not a signature. Set
            # once, on create, by the viewset.
            "employee_name",
        ]

    def get_missing(self, obj):
        return missing_for_release(obj)

    def get_totals(self, obj):
        totals = measurement_totals(list(obj.measurements.all()))
        # Strings, like every other decimal DRF sends, so the browser never
        # sees 2.3100000000000001.
        return {
            key: (str(value) if value is not None and key != "colli" else value)
            for key, value in totals.items()
        }

    def create(self, validated_data):
        lines = validated_data.pop("measurements", None)

        with transaction.atomic():
            sheet = super().create(validated_data)
            if lines is not None:
                self._replace_measurements(sheet, lines)

        return sheet

    def update(self, instance, validated_data):
        lines = validated_data.pop("measurements", None)

        with transaction.atomic():
            sheet = super().update(instance, validated_data)
            if lines is not None:
                self._replace_measurements(sheet, lines)

        return sheet

    def _replace_measurements(self, sheet, lines):
        """Swap the sheet's lines for these, and carry the totals across.

        Once there are lines, Aantal colli and Aantal kuub are worked out from
        them rather than typed. Both fields stay on the sheet - the e-mail, the
        list and the release check all read them - but a number that can be
        calculated is a number that should not be able to disagree with the
        lines it came from.
        """
        sheet.measurements.all().delete()
        Measurement.objects.bulk_create(
            Measurement(sheet=sheet, position=index, **line)
            for index, line in enumerate(lines)
        )

        # Dropped so the next read sees the rows just written rather than a
        # prefetch taken before them.
        getattr(sheet, "_prefetched_objects_cache", {}).pop("measurements", None)

        if not lines:
            return

        totals = measurement_totals(list(sheet.measurements.all()))
        sheet.colli_count = totals["colli"]
        update = ["colli_count", "updated_at"]

        if totals["volume_m3"] is not None:
            sheet.volume_m3 = totals["volume_m3"]
            update.append("volume_m3")

        sheet.save(update_fields=update)

    def _name(self, user):
        if user is None:
            return ""
        return user.get_full_name() or user.email

    def get_created_by_name(self, obj):
        return self._name(obj.created_by)

    def get_released_by_name(self, obj):
        return self._name(obj.released_by)

    def validate(self, attrs):
        """Only what would be wrong however incomplete the sheet is.

        A draft is allowed to be half-written - that is what a draft is for,
        and a form that refuses to save until it is perfect is a form somebody
        fills in on paper first. So the emptiness checks are not here; they
        are in missing_for_release, and they bite once, at the release.

        What is checked here is the pair of fields that can contradict each
        other: a write-in packaging with no choice of "anders" against it is a
        line nobody will read.
        """
        instance = self.instance
        packaging = attrs.get(
            "packaging", instance.packaging if instance else ""
        )
        other = attrs.get(
            "packaging_other", instance.packaging_other if instance else ""
        )

        if other and packaging and packaging != IntakeSheet.Packaging.OTHER:
            raise serializers.ValidationError(
                {
                    "packaging_other": (
                        "Only fill this in when Verpakking is set to Anders."
                    )
                }
            )

        return attrs
