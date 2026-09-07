"""Where an invoice comes from.

Called from staff/views.py when a package is marked paid. Deliberately a
function rather than a post_save signal on Package:

  * Package.save() runs for reasons that have nothing to do with money — the
    delivery address is frozen there, staff edit a weight, the seed command
    writes rows. A signal would fire on every one of those and would have to
    work out from the arguments whether this particular save was the one that
    mattered, which is the sort of thing that is right until someone adds a
    field.
  * The codebase already stamps shipped_at and delivered_at in
    PackageViewSet.perform_update by comparing the incoming status with the
    stored one. This is the same event, so it is handled in the same place,
    where the before and after are both in hand.
  * A signal is invisible at the call site. Somebody reading perform_update
    can see this happen; they cannot see a signal.
"""

from django.db import transaction

from .models import Invoice


def ensure_invoice_for_package(package):
    """Create the invoice for a paid package and put it in the review queue.

    Idempotent: a package that already has an invoice is left alone, whatever
    state that invoice is in. Marking a package paid twice, or moving it back
    to paid after a correction, must not reset a review that is already under
    way or resurrect one that was approved.

    Returns the invoice, existing or new.
    """
    existing = Invoice.objects.filter(package=package).first()
    if existing is not None:
        return existing

    with transaction.atomic():
        # Created in DRAFT and moved on, rather than created straight into
        # PENDING_REVIEW: DRAFT is a real state in the machine and the invoice
        # passes through it, so there is one path into the queue instead of
        # two. Both statements are in one transaction, so no other request can
        # observe the intermediate DRAFT row.
        invoice = Invoice.objects.create(package=package)
        invoice.submit_for_review()

    return invoice
