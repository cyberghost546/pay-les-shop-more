"""Sending the e-mail copy of a notification, on a worker.

Queued from notifications/services.py through transaction.on_commit. Nothing
here decides *whether* something happened — that is the caller's job, and the
row already exists by the time this runs. This only decides whether an e-mail
about it should leave, and gets it out of the door.
"""

import logging

from celery import shared_task
from django.core.mail import send_mail
from django.utils import timezone

from .messages import body_for, subject_for
from .models import Notification

logger = logging.getLogger(__name__)


def should_email(notification):
    """Whether this notification is one the customer should get mail about.

    Three reasons not to send:

    * There is no address to send to. An anonymised account has had its e-mail
      cleared, and a shipment can still move afterwards.
    * The customer has turned shipping e-mail off. That preference is theirs to
      set on the profile page and this is where it is honoured — the row is
      still written, so turning e-mail off silences the inbox, not the history.
    * It has already been sent. Not checked here but in the claim below, which
      is where it can be done without a race.

    Invoices are the exception to the preference: an invoice is a document about
    money that the customer is owed a copy of, and "do not send me shipping
    updates" is not a request to be kept from a bill. They still control it —
    the e-mail only ever points at the profile page, never attaches the PDF.
    """
    if not notification.user.email:
        return False

    if notification.kind == Notification.Kind.INVOICE_SENT:
        return True

    return bool(notification.user.notify_shipping)


def _claim(notification):
    """Mark the notification as e-mailed, but only if nobody else has.

    A conditional UPDATE, the same shape as the invoice state machine's: two
    workers handed the same job both read emailed_at as null, and only one of
    them changes a row. The loser gets False back and sends nothing, so a retry
    after CELERY_TASK_ACKS_LATE puts the job back cannot mail a customer twice.

    Claimed *before* the send rather than stamped after it. The failure modes
    are not symmetrical: claiming first risks a lost e-mail if the SMTP call
    then fails, stamping after risks a duplicate. A customer who did not get an
    e-mail still has the notification in their profile; a customer who got two
    identical invoices in their inbox has been told something untrue.
    """
    claimed = Notification.objects.filter(
        pk=notification.pk, emailed_at__isnull=True
    ).update(emailed_at=timezone.now())

    return bool(claimed)


@shared_task(
    bind=True,
    # Transient mail-server trouble is worth another go and clears on its own.
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_notification_email(self, notification_id):
    """E-mail one notification to the customer it belongs to."""
    notification = (
        Notification.objects.select_related("user").filter(pk=notification_id).first()
    )

    if notification is None:
        # The account was hard-deleted between the event and this job.
        logger.info("Notification %s no longer exists.", notification_id)
        return

    if not should_email(notification):
        logger.info(
            "Notification %s is not one to e-mail; the row stands on its own.",
            notification_id,
        )
        return

    if not _claim(notification):
        logger.info("Notification %s has already been e-mailed.", notification_id)
        return

    try:
        send_mail(
            subject=subject_for(notification),
            message=body_for(notification),
            from_email=None,  # DEFAULT_FROM_EMAIL
            recipient_list=[notification.user.email],
            # Failures are raised so the retry above can see them. Without this
            # a dead mail server is silently successful.
            fail_silently=False,
        )
    except Exception:
        # Hand the claim back, so a retry — or a later re-queue by hand — can
        # still send it. Leaving emailed_at set would mark as delivered
        # something that never left.
        Notification.objects.filter(pk=notification.pk).update(emailed_at=None)
        raise

    logger.info("Notification %s e-mailed to the customer.", notification_id)
