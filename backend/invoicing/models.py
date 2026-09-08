"""Invoices, and the state machine an invoice is allowed to move through.

An invoice is a document about money that leaves the building, so who approved
it and when is part of the record rather than something reconstructed later
from a log. The states are:

    DRAFT -> PENDING_REVIEW -> APPROVED -> SENT
                            -> REJECTED -> PENDING_REVIEW (after correction)

The rules live on the model, not in the view. A view is one caller; the admin,
a management command, a data fix in the shell and the next milestone's sending
job are all callers too. Putting the check where the data is means there is no
way in that skips it.
"""

import logging

from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


def invoice_pdf_path(instance, filename):
    """Where a rendered invoice is written, under MEDIA_ROOT.

    Foldered by year so the directory does not grow into a single flat listing
    of every invoice ever raised, and named after the tracking number so a file
    found on disk can be traced back to a shipment without a database lookup.
    Django appends a suffix rather than overwriting if the name is already
    taken, so a re-render leaves the previous file alone instead of destroying
    the document a customer may already have been sent.
    """
    return f"invoices/{timezone.localtime(instance.created_at):%Y}/{filename}"


class InvalidInvoiceTransition(Exception):
    """A move the state machine does not allow.

    Raised by the transition methods below. staff/views.py turns it into a
    409, because it means the caller's idea of the invoice's state is stale —
    not that the request was malformed.
    """


class Invoice(models.Model):
    """The invoice for one shipment, and its position in the review flow."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        SENT = "sent", "Sent"

    # Which moves are legal, as data rather than as a chain of ifs. Read as
    # "to enter this state, the invoice must currently be in one of these".
    ALLOWED_FROM = {
        Status.PENDING_REVIEW: (Status.DRAFT, Status.REJECTED),
        Status.APPROVED: (Status.PENDING_REVIEW,),
        Status.REJECTED: (Status.PENDING_REVIEW,),
        Status.SENT: (Status.APPROVED,),
    }

    # CASCADE rather than PROTECT, for the same reason Package.delivery_address
    # is SET_NULL: PROTECT here would make deleting a customer impossible,
    # because that cascade reaches their packages and would stop dead on this
    # row. An invoice for a shipment that no longer exists is not a record of
    # anything anyway. The normal erasure path is User.anonymise(), which keeps
    # every package and so every invoice.
    package = models.OneToOneField(
        "accounts.Package",
        on_delete=models.CASCADE,
        related_name="invoice",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    # PROTECT: this is the audit trail. A staff account that has approved
    # invoices cannot be deleted out from under them, which is the point of
    # recording who approved it. Erasure goes through User.anonymise(), which
    # keeps the row and so keeps this pointer valid.
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_invoices",
        limit_choices_to={"is_staff": True},
        help_text="The staff member who approved or rejected it.",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Required when rejecting: whoever corrects the invoice has to be told what
    # is wrong with it, or the rejection is just a closed door.
    rejection_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    # The rendered document, written by invoicing.tasks.render_approved_invoice
    # once the invoice is approved. Empty until then: an invoice under review is
    # not a document anybody should be able to fetch, so there is nothing to
    # fetch. Not a CharField holding a path — a FileField goes through
    # DEFAULT_FILE_STORAGE, so moving media to S3 later is a settings change
    # rather than a rewrite of everything that touches this column.
    pdf = models.FileField(
        upload_to=invoice_pdf_path,
        blank=True,
        help_text="Rendered on approval. Not written by hand.",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The one query the review queue makes.
            models.Index(fields=["status", "-created_at"]),
        ]
        constraints = [
            # The state machine's invariants, enforced by the database. The
            # transition methods below are what code should call; these are the
            # backstop for a bulk update(), a fixture or a hand-written
            # migration that goes around them.
            #
            # Literals rather than Status.APPROVED and friends: a constraint is
            # frozen into a migration, and a name that is later renamed in this
            # file would leave the migration referring to something that no
            # longer exists.
            models.CheckConstraint(
                condition=(
                    ~Q(status__in=["approved", "sent"])
                    | Q(reviewed_by__isnull=False, reviewed_at__isnull=False)
                ),
                name="invoice_reviewed_when_approved_or_sent",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(status="rejected")
                    | (
                        Q(reviewed_by__isnull=False, reviewed_at__isnull=False)
                        & ~Q(rejection_reason="")
                    )
                ),
                name="invoice_rejected_needs_reason",
            ),
            models.CheckConstraint(
                condition=~Q(status="sent") | Q(sent_at__isnull=False),
                name="invoice_sent_needs_sent_at",
            ),
            # "Sent" is a claim that a document left the building, so there has
            # to be a document. Without this, a failed render followed by a
            # mark_sent() would leave an invoice the customer is told was sent
            # and nothing to show them.
            models.CheckConstraint(
                condition=~Q(status="sent") | ~Q(pdf=""),
                name="invoice_sent_needs_pdf",
            ),
            # Nothing still awaiting a verdict carries one. This is what makes a
            # corrected invoice a clean slate rather than one still showing the
            # previous reviewer's name.
            models.CheckConstraint(
                condition=(
                    ~Q(status__in=["draft", "pending_review"])
                    | Q(
                        reviewed_by__isnull=True,
                        reviewed_at__isnull=True,
                        rejection_reason="",
                    )
                ),
                name="invoice_unreviewed_has_no_verdict",
            ),
        ]

    def __str__(self):
        return f"Invoice for {self.package.tracking_number} ({self.get_status_display()})"

    # ---- the state machine ---------------------------------------------

    def _transition(self, to_status, **fields):
        """Move to `to_status`, or raise if that move is not allowed.

        Written as a conditional UPDATE — "set these columns on this row, but
        only while it is still in a state that permits the move" — rather than
        as a check followed by a save. The check-then-save version has a race:
        two staff members press Approve at the same moment, both read
        PENDING_REVIEW, both pass the check, and the invoice is approved twice
        with the second reviewer's name quietly overwriting the first. Here the
        database decides, in one statement, and the loser matches zero rows and
        gets an error.
        """
        allowed = self.ALLOWED_FROM[to_status]

        # Checked in Python first only so the ordinary case produces a message
        # naming both states. The UPDATE below is what actually holds.
        if self.status not in allowed:
            raise InvalidInvoiceTransition(
                f"An invoice cannot go from {self.get_status_display()} to "
                f"{self.Status(to_status).label}."
            )

        updated = self.__class__.objects.filter(
            pk=self.pk, status__in=allowed
        ).update(status=to_status, updated_at=timezone.now(), **fields)

        if not updated:
            # Someone else moved it between our read and our write.
            raise InvalidInvoiceTransition(
                "This invoice was changed by someone else. Reload and try again."
            )

        # The in-memory copy is now stale in exactly the columns that were
        # written, so it is re-read rather than patched up field by field.
        self.refresh_from_db()
        return self

    def submit_for_review(self):
        """DRAFT or REJECTED -> PENDING_REVIEW.

        A rejected invoice comes back with a clean slate: the previous reviewer
        and reason are cleared, so the queue shows an invoice waiting for a
        verdict rather than one still wearing the old one. Keeping the history
        of every rejection would need a table of its own, which this milestone
        does not have.
        """
        return self._transition(
            self.Status.PENDING_REVIEW,
            reviewed_by=None,
            reviewed_at=None,
            rejection_reason="",
        )

    def approve(self, reviewed_by):
        """PENDING_REVIEW -> APPROVED, and queue the PDF that follows from it.

        The render is scheduled here rather than in the view for the same
        reason the transition rules are on the model: the view is one caller.
        The admin, a management command and a data fix in the shell all reach
        approval through this method, and an approved invoice that never gets
        rendered because it was approved from the wrong place is a silent hole.

        Queued through transaction.on_commit, so the worker cannot start before
        the transaction that approved the invoice has landed. Scheduled
        directly, the task can and does win that race: it reads a row still
        showing PENDING_REVIEW and declines to do anything, and the invoice is
        left approved with no document and no job coming.
        """
        self._transition(
            self.Status.APPROVED,
            reviewed_by=reviewed_by,
            reviewed_at=timezone.now(),
            rejection_reason="",
        )

        # Imported here, not at module scope: tasks.py imports this module, and
        # at import time Celery's autodiscovery is still walking the app list.
        from .tasks import render_approved_invoice

        transaction.on_commit(lambda: self._queue_render(render_approved_invoice))

        return self

    def _queue_render(self, task):
        """Hand the render to a worker, and survive there not being one.

        A broker that is down makes .delay() raise, and this runs from an
        on_commit hook — after the approval is committed but still inside the
        request, so the exception would surface as a 500 for a reviewer whose
        approval actually succeeded. Worse, it would tell them to try again on
        an invoice that is no longer in a state where approving is allowed.

        So it is caught and logged. The invoice stays APPROVED with no PDF,
        which is the same recoverable state a failed render leaves behind, and
        the same one a re-queue fixes. Approving is the reviewer's decision and
        it stands; the document is a consequence of it, and a missing
        consequence is repairable in a way that a lost decision is not.
        """
        try:
            task.delay(self.pk)
        except Exception:
            logger.exception(
                "Invoice %s was approved but its render could not be queued. "
                "It is still APPROVED and can be re-queued.",
                self.pk,
            )

    def reject(self, reviewed_by, reason):
        """PENDING_REVIEW -> REJECTED. The reason is not optional."""
        reason = (reason or "").strip()
        if not reason:
            raise InvalidInvoiceTransition("A rejection has to say what is wrong.")

        return self._transition(
            self.Status.REJECTED,
            reviewed_by=reviewed_by,
            reviewed_at=timezone.now(),
            rejection_reason=reason,
        )

    def replace_document(self, pdf_name):
        """Swap the document on an invoice the customer already has.

        Only from SENT, and the status does not move: this is a correction to
        a document that has already gone out, not a second sending. The
        customer is deliberately not notified again — "your invoice has been
        sent" is not true a second time, and telling them a document changed
        without being able to say how is worse than the office telephoning
        them, which is what actually happens.

        Written as the same conditional UPDATE as every transition, so two
        people replacing at once cannot interleave, and so an invoice that has
        been moved out of SENT in the meantime is refused rather than quietly
        given a document it should not have.
        """
        if not pdf_name:
            raise InvalidInvoiceTransition("There is no document to attach.")

        updated = self.__class__.objects.filter(
            pk=self.pk, status=self.Status.SENT
        ).update(pdf=pdf_name, updated_at=timezone.now())

        if not updated:
            raise InvalidInvoiceTransition(
                "Only an invoice that has already been sent can have its "
                "document replaced. Reload and try again."
            )

        self.refresh_from_db()
        return self

    def mark_sent(self, pdf_name):
        """APPROVED -> SENT, recording the document that was sent.

        `pdf_name` is a storage name, not a file: the caller writes the bytes
        through the storage backend first and passes back the name it was given.
        That keeps this a single UPDATE, so it stays the same conditional write
        as every other transition and cannot be won twice.

        Required rather than optional, and matched by the invoice_sent_needs_pdf
        constraint: there is no such thing as a sent invoice with nothing to
        show for it.
        """
        if not pdf_name:
            raise InvalidInvoiceTransition(
                "An invoice cannot be marked sent without a rendered document."
            )

        self._transition(self.Status.SENT, sent_at=timezone.now(), pdf=pdf_name)

        # Telling the customer is part of sending, not a step the caller has to
        # remember. _transition is a conditional UPDATE that only one caller can
        # win, so this runs exactly once per invoice however many workers race
        # for it — no guard against a duplicate is needed here.
        #
        # Imported at call time, not module scope: notifications.services reads
        # invoicing.pdf, and importing it up here would make this module import
        # itself through the back door.
        from notifications.services import notify_invoice_sent

        notify_invoice_sent(self)

        return self
