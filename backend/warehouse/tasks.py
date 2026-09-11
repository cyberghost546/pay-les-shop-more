"""Sending the handover e-mail, on a worker.

Queued from warehouse/services.py through transaction.on_commit. Nothing here
decides whether a sheet was released - that already happened, and the row says
so. This only gets the copy of it out of the door.

Shaped like notifications/tasks.py on purpose, down to the claim-before-send:
the two are the same problem, and a reader who has understood one should not
have to work the other out from scratch.
"""

import logging

from celery import shared_task
from django.core.mail import send_mail
from django.utils import timezone

from .messages import body_for, subject_for
from .models import IntakeSheet
from .recipients import handover_recipients

logger = logging.getLogger(__name__)


def _claim(sheet):
    """Mark the sheet as e-mailed, but only if nobody else has.

    The same conditional UPDATE as Notification._claim, and for the same
    reason: a retry after CELERY_TASK_ACKS_LATE puts the job back must not
    mail the whole staff a second copy of the same sheet.

    Claimed before the send rather than stamped after it. The failure modes
    are not symmetrical - claiming first risks a lost e-mail if SMTP then
    fails, stamping after risks a duplicate - and a released sheet is on the
    dashboard either way, so a missing e-mail is a delay while a duplicate is
    two people starting the same job.
    """
    claimed = IntakeSheet.objects.filter(
        pk=sheet.pk, emailed_at__isnull=True
    ).update(emailed_at=timezone.now())

    return bool(claimed)


@shared_task(
    bind=True,
    # Transient mail-server trouble is worth another go and clears on its own.
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_intake_release_email(self, sheet_id, exclude_user_id=None):
    """Mail one released intake sheet to the staff who have to act on it.

    `exclude_user_id` is whoever pressed Release, passed as an id rather than
    a user because a task argument has to survive being serialised onto a
    queue and read back by a different process.
    """
    sheet = (
        IntakeSheet.objects.select_related("released_by", "booking", "package")
        .filter(pk=sheet_id)
        .first()
    )

    if sheet is None:
        # Deleted between the release and this job. Nothing to send, and
        # nothing wrong.
        logger.info("Intake sheet %s no longer exists.", sheet_id)
        return

    if not sheet.released:
        # Not reachable from release_sheet(), which only queues after the
        # transition has succeeded. Checked anyway because this task can also
        # be run by hand from a shell, and mailing a draft around is exactly
        # the thing the draft state exists to prevent.
        logger.warning(
            "Intake sheet %s is not released; nothing was sent.", sheet_id
        )
        return

    exclude = sheet.released_by if sheet.released_by_id == exclude_user_id else None
    addresses = handover_recipients(exclude=exclude)

    if not addresses:
        logger.warning(
            "Intake sheet %s was released with nobody to tell. Check that "
            "staff accounts have work addresses and notify_warehouse set.",
            sheet_id,
        )
        return

    if not _claim(sheet):
        logger.info("Intake sheet %s has already been e-mailed.", sheet_id)
        return

    try:
        send_mail(
            subject=subject_for(sheet),
            message=body_for(sheet),
            from_email=None,  # DEFAULT_FROM_EMAIL
            recipient_list=addresses,
            # Raised so the retry above can see them. Without this a dead mail
            # server is silently successful.
            fail_silently=False,
        )
    except Exception:
        # Hand the claim back, so a retry - or a later re-queue by hand - can
        # still send it. Leaving emailed_at set would mark as delivered
        # something that never left.
        IntakeSheet.objects.filter(pk=sheet.pk).update(emailed_at=None)
        raise

    logger.info(
        "Intake sheet %s e-mailed to %d staff address(es).", sheet_id, len(addresses)
    )
