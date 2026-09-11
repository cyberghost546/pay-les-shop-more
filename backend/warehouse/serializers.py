"""The intake sheet over the wire, and what "finished" means for one.

Two jobs live here. The serializer is the ordinary one; `missing_for_release`
is the interesting one, and it is the reason a sheet has a draft state at all.
"""

from rest_framework import serializers

from .models import IntakeSheet

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
