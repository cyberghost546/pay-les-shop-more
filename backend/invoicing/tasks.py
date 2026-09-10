"""What happens after an invoice is approved.

Approving is a decision a person makes and gets an answer to immediately.
Rendering the document that follows from that decision is work — a few hundred
milliseconds of drawing plus a write to storage, and more once media lives
behind a network — so it happens here, on a worker, and not in the request that
approved the invoice.

Queued from Invoice.approve() through transaction.on_commit; see the comment
there for why that ordering matters.
"""

import logging

from celery import shared_task
from django.core.files.base import ContentFile

from .models import InvalidInvoiceTransition, Invoice
from .pdf import invoice_number, render_invoice_pdf

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    # Storage and database hiccups are the failures worth trying again for, and
    # they clear on their own. Bounded, with a widening gap, so a genuinely
    # broken render fails visibly instead of grinding round forever.
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def render_approved_invoice(self, invoice_id):
    """Render an approved invoice to PDF, attach it, and mark it sent.

    Safe to run more than once. CELERY_TASK_ACKS_LATE means a worker that dies
    mid-render puts the job back on the queue, and a retry re-runs everything
    above, so the guard below is what keeps a second run from producing a second
    document for an invoice that already has one.

    The status check is the guard, and it is a check rather than a lock because
    mark_sent() is a conditional UPDATE: two workers can both get here, both see
    APPROVED, and only one of them will win the write. The loser catches the
    refusal and cleans up after itself.
    """
    invoice = (
        Invoice.objects.select_related("package", "package__user", "reviewed_by")
        .filter(pk=invoice_id)
        .first()
    )

    if invoice is None:
        # The package it belonged to was deleted between approval and here.
        # Nothing to render and nothing wrong, so this is not an error.
        logger.info("Invoice %s no longer exists; nothing to render.", invoice_id)
        return

    if invoice.status != Invoice.Status.APPROVED:
        # Already sent by an earlier run of this task, or moved on by someone
        # else. Either way this run has no work to do.
        logger.info(
            "Invoice %s is %s, not approved; skipping render.",
            invoice_id,
            invoice.status,
        )
        return

    if invoice.pdf:
        # Somebody attached a document by hand before this ran - an invoice
        # raised through the dashboard's Add invoice form, where the PDF is
        # part of creating it. Drawing over it would replace the document a
        # person chose with one this code invented, which is the opposite of
        # what attaching it meant.
        #
        # Nothing is sent either. An approved invoice that already carries a
        # document got there by somebody choosing "approve it, but do not send
        # yet", and sending it here would overrule that decision from a worker
        # they cannot see. It waits for the Send button, which is what they
        # said they wanted.
        logger.info(
            "Invoice %s already has a document; leaving it approved and unsent.",
            invoice_id,
        )
        return

    content = ContentFile(render_invoice_pdf(invoice))
    filename = f"{invoice_number(invoice)}-{invoice.package.tracking_number}.pdf"

    # save=False: the field is written by mark_sent's UPDATE, together with the
    # status and sent_at, so the row never shows a file without the status that
    # goes with it. This call is the one that puts the bytes in storage and
    # tells us the name they were stored under, which may differ from the name
    # asked for if something is already there.
    invoice.pdf.save(filename, content, save=False)

    # No uploaded_by: nobody chose this file, the worker drew it. See
    # Invoice.document_uploaded_by for why that null is information.
    invoice.record_document(filename=filename)

    try:
        invoice.mark_sent(invoice.pdf.name)
    except InvalidInvoiceTransition:
        # Another worker got there first. The file this run wrote is not the one
        # on the invoice, so it is removed rather than left behind as an orphan
        # nothing points at.
        invoice.pdf.delete(save=False)
        logger.info("Invoice %s was already sent by another run.", invoice_id)
        return

    logger.info("Invoice %s rendered to %s and marked sent.", invoice_id, invoice.pdf.name)
