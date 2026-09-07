"""The customer's own invoices, and the only way to fetch the PDF.

The document must not be reachable through MEDIA_URL. Media is served by
django.conf.urls.static in development and by nothing at all in production, and
in neither case does anything check who is asking — a MEDIA_URL link to an
invoice is a bearer token made of a guessable filename, for a document with
somebody's name, address and the value of their shipment on it. So the file is
served by this view, which knows who is signed in, and the storage path is
never put in a response.

Customers see only invoices that have been sent. An invoice still in review is
not something they are owed a look at, and its rejection_reason is written by
staff for staff — see StaffInvoiceSerializer for the queue's own view.
"""

from django.http import FileResponse, Http404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from .models import Invoice
from .serializers import CustomerInvoiceSerializer


class InvoiceViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Read-only. An invoice is raised and moved by the state machine, never by
    the customer it belongs to."""

    serializer_class = CustomerInvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Scoped to the signed-in customer and to sent invoices, in the
        # queryset rather than in each handler: no id comes from the browser
        # that has not already been narrowed to rows this person may see, so
        # somebody else's invoice id is a 404 and not a decision made later.
        return (
            Invoice.objects.filter(
                package__user=self.request.user,
                status=Invoice.Status.SENT,
            )
            .select_related("package")
            .order_by("-sent_at")
        )

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        """Stream the document itself.

        get_object() applies the queryset above, so this is already limited to
        a sent invoice belonging to the caller. The remaining failure is a row
        that points at a file which is not there — a media directory restored
        without its contents, say — which is a 404 rather than the 500 that
        opening a missing file would otherwise produce.
        """
        invoice = self.get_object()

        if not invoice.pdf:
            raise Http404("This invoice has no document.")

        try:
            handle = invoice.pdf.open("rb")
        except FileNotFoundError:
            raise Http404("This invoice's document is missing.")

        # as_attachment, so a browser saves it under a name that means something
        # rather than rendering it in a tab called by its storage path.
        return FileResponse(
            handle,
            as_attachment=True,
            filename=f"{invoice.number}.pdf",
            content_type="application/pdf",
        )
