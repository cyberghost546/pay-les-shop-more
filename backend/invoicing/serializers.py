"""Serializers for invoices: the review queue's view and the customer's.

Same arrangement as bookings: the model and its serializers stay with the app
that owns them, and the staff dashboard imports what it needs.
"""

from django.urls import reverse
from rest_framework import serializers

from .models import Invoice
from .pdf import invoice_number


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


class CustomerInvoiceSerializer(serializers.ModelSerializer):
    """An invoice as the customer who paid for it sees it.

    Deliberately smaller than StaffInvoiceSerializer. Nothing about the review
    is here — who approved it, when they approved it, why an earlier version
    was rejected are all internal, and the queryset in InvoiceViewSet only ever
    hands this serializer invoices that have been sent anyway.

    There is no pdf_url either. The stored path must not reach the browser: it
    would be a MEDIA_URL link to somebody's name, address and shipment value,
    guarded by nothing but the filename. `download_url` points at the view that
    checks the session instead.
    """

    number = serializers.SerializerMethodField()
    tracking_number = serializers.CharField(
        source="package.tracking_number", read_only=True
    )
    description = serializers.CharField(source="package.description", read_only=True)
    value_eur = serializers.DecimalField(
        source="package.value_eur",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "tracking_number",
            "description",
            "value_eur",
            "sent_at",
            "created_at",
            "download_url",
        ]
        read_only_fields = fields

    def get_number(self, obj):
        return invoice_number(obj)

    def get_download_url(self, obj):
        """The route that streams the document, absolutised when we have the
        request. Relative is still correct for the browser — the dev server
        proxies /api to Django, so both origins agree — but a test or a mail
        template calling this serializer without a request gets a usable path
        rather than a crash."""
        path = reverse("invoice-pdf", kwargs={"pk": obj.pk})
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path


class InvoiceDocumentSerializer(serializers.Serializer):
    """The body of a document upload: one PDF, checked before it is stored.

    An uploaded file is the one thing on this API that a browser hands over
    verbatim, so nothing about it is taken on trust. The name it arrives with
    is decoration — Django's storage backend picks the stored name — and the
    content type is whatever the browser felt like claiming, so the check that
    actually holds is the one against the first five bytes.
    """

    # 10 MB. DATA_UPLOAD_MAX_MEMORY_SIZE is 11 MB, so this refuses with a
    # field error the form can show rather than with Django's own 413 further
    # up, which arrives as an opaque failure.
    MAX_BYTES = 10 * 1024 * 1024

    # Every PDF begins with these five bytes. A file that does not is not one,
    # whatever it is called and whatever the browser said it was.
    MAGIC = b"%PDF-"

    pdf = serializers.FileField(
        help_text="The invoice document, as a PDF.",
    )

    def validate_pdf(self, uploaded):
        if uploaded.size == 0:
            raise serializers.ValidationError("That file is empty.")

        if uploaded.size > self.MAX_BYTES:
            megabytes = self.MAX_BYTES // (1024 * 1024)
            raise serializers.ValidationError(
                f"That file is larger than {megabytes} MB."
            )

        head = uploaded.read(len(self.MAGIC))
        # Rewound, or whatever stores the file afterwards starts five bytes in
        # and writes a document no reader will open.
        uploaded.seek(0)

        if head != self.MAGIC:
            raise serializers.ValidationError(
                "That file is not a PDF. Invoices are sent to customers as "
                "PDFs, so only a PDF can be attached to one."
            )

        return uploaded
