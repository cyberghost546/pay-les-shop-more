"""Serializers for the invoice review queue. The views live in staff/views.py.

Same arrangement as bookings: the model and its serializers stay with the app
that owns them, and the staff dashboard imports what it needs.
"""

from rest_framework import serializers

from .models import Invoice


class StaffInvoiceSerializer(serializers.ModelSerializer):
    """An invoice as the review queue shows it.

    Every field is read-only. Status is never written by assigning to it — it
    moves through the approve and reject actions, which is what keeps the state
    machine from being bypassed by a plain PATCH.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    tracking_number = serializers.CharField(
        source="package.tracking_number", read_only=True
    )
    value_eur = serializers.DecimalField(
        source="package.value_eur",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    # use_url with the request in the serializer context gives an absolute
    # URL, which is what the dashboard needs — it runs on a different origin
    # from the API, so a path relative to the API host would resolve against
    # the Vite dev server. Empty until the render task has run, and null rather
    # than "" so the React side can test it directly.
    pdf_url = serializers.FileField(source="pdf", read_only=True, use_url=True)
    customer = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "package",
            "tracking_number",
            "value_eur",
            "customer",
            "status",
            "status_display",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_at",
            "updated_at",
            "sent_at",
            "pdf_url",
        ]
        read_only_fields = fields

    def get_customer(self, obj):
        # str(User) already handles the anonymised case, where there is no name
        # left to show.
        return str(obj.package.user)

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by_id else None


class InvoiceRejectSerializer(serializers.Serializer):
    """The body of a reject request.

    allow_blank is left at its default of False, so an empty string is a 400
    with a field error rather than something the view has to notice. The model
    refuses a blank reason as well — this is the layer that produces a helpful
    message, not the layer that guarantees the rule.
    """

    rejection_reason = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
        help_text="Shown to whoever corrects the invoice, so it has to be specific.",
    )
