"""What a customer is told, and whether they have been told it yet.

A notification is a row first and an e-mail second. The row is the record: it
survives a bounced address, a customer who has turned e-mail off, and an SMTP
server that was down at the wrong moment, and it is what the profile page
reads. The e-mail is a copy of it sent somewhere else, and its own success or
failure is tracked on the same row.

Nothing here stores rendered text. A notification keeps its `kind` and a small
`context` of the facts it was raised about, and the words are produced on the
way out — in English for e-mail by notifications/messages.py, and in the
reader's own language by the React app. Freezing a sentence at write time would
mean a Dutch customer reading English because of what the site was doing on the
day their package moved.

That is the opposite of the choice Package.delivery_address_text makes, and
deliberately: an address on a shipment record is a fact about where something
went and must not drift, while a notification is a nudge towards a row that is
itself the record. The facts are in `context`; only the wording is late-bound.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    """One thing worth telling one customer."""

    class Kind(models.TextChoices):
        INVOICE_SENT = "invoice_sent", "Invoice sent"
        SHIPMENT_STATUS = "shipment_status", "Shipment status changed"

    # CASCADE: a notification is about the customer and is meaningless without
    # them. The normal erasure path is User.anonymise(), which keeps the row —
    # so this only fires on a genuine hard delete, where the whole account goes.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    kind = models.CharField(max_length=32, choices=Kind.choices)

    # The facts the wording is built from — tracking_number, status,
    # invoice_number. Denormalised on purpose: the notification has to still
    # read correctly after the package or invoice it points at is gone, and the
    # two links below are both nullable for exactly that reason.
    context = models.JSONField(default=dict, blank=True)

    # SET_NULL rather than CASCADE, so deleting a shipment does not silently
    # erase the customer's history of being told about it.
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    invoice = models.ForeignKey(
        "invoicing.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # Null until the customer has seen it. A timestamp rather than a boolean:
    # "when" answers "whether" as well, and costs the same.
    read_at = models.DateTimeField(null=True, blank=True)

    # Null until the e-mail has actually gone out. This is what makes sending
    # exactly-once under a worker retry — see notifications/tasks.py.
    emailed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The profile page's list.
            models.Index(fields=["user", "-created_at"]),
            # The unread count beside it.
            models.Index(fields=["user", "read_at"]),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} for {self.user}"

    def mark_read(self):
        """Idempotent, and keeps the first time it was seen.

        Re-marking would otherwise move the timestamp every time the page is
        opened, which turns "when did they first see this" into "when did they
        last look at the list".
        """
        if self.read_at is not None:
            return self

        self.read_at = timezone.now()
        self.save(update_fields=["read_at"])
        return self
