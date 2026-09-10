"""HTTP answers for the refusals invoicing makes.

Kept out of models.py, which knows nothing about HTTP and should not start to,
and out of serializers.py, which is about the shape of a body rather than the
status code that carries it. Both the create serializer and the staff view
raise these, so they live where neither has to import the other.
"""

from rest_framework import status
from rest_framework.exceptions import APIException


class InvoiceAlreadyExists(APIException):
    """A second invoice for a shipment that already has one.

    409 rather than 400. The request was well formed and the caller was allowed
    to make it; the shipment simply already has an invoice, which is not a
    field to correct but a thing that already happened. Invoice.package is a
    OneToOneField, so this is impossible at the database level anyway — this
    exists to turn that impossibility into a sentence and an id, so the
    dashboard can offer to open the invoice that exists instead of reporting a
    constraint violation.

    The body carries `existing_invoice` and `tracking_number` alongside the
    message, which is what the "View existing invoice" button is built from.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = "An invoice already exists for this shipment."

    def __init__(self, invoice):
        super().__init__(
            {
                "detail": self.default_detail,
                "existing_invoice": invoice.pk,
                "tracking_number": invoice.package.tracking_number,
                "status": invoice.status,
            }
        )
