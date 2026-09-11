"""Releasing a sheet, and getting the e-mail on its way.

One function, called from one place - IntakeSheetViewSet.release. It exists
rather than the view doing both halves itself so that the order of the two is
written down once: the row moves first, inside the caller's transaction, and
the e-mail is queued only after that transaction commits.

That order is the whole point. A worker that picks the job up the instant it
is queued would otherwise read a sheet that is not released yet, or not there
at all, and mail the entire staff about a handover the database has since
rolled back.
"""

import logging

from django.db import transaction

logger = logging.getLogger(__name__)


def release_sheet(sheet, by=None):
    """Hand a draft sheet to the rest of the staff.

    Raises AlreadyReleased if somebody got there first; that is the one
    failure a caller has to answer for, and the view turns it into a 409.

    Failure to *queue* the e-mail is swallowed, the same way
    notifications/services.py swallows it and for the same reason: this runs
    from an on_commit hook, after the release is already committed, so raising
    would report a handover that plainly succeeded as a 500. The sheet is
    released either way and is on everyone's dashboard - only the copy in
    their inbox is lost, and `emailed_at` stays null to say so.
    """
    sheet.release(by=by)

    def send():
        # Imported at call time: tasks.py imports this app's models, and at
        # import time Celery's autodiscovery is still walking the app list.
        from .tasks import send_intake_release_email

        try:
            send_intake_release_email.delay(
                sheet.pk, exclude_user_id=by.pk if by is not None else None
            )
        except Exception:
            logger.exception(
                "Intake sheet %s was released but its e-mail could not be "
                "queued. The handover stands; only the mail is missing.",
                sheet.pk,
            )

    transaction.on_commit(send)
    return sheet
