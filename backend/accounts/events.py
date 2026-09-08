"""Writing to the order history.

A function rather than signals, for the reasons invoicing/services.py already
sets out at length: a signal fires on saves that have nothing to do with the
thing being recorded, has to work out from its arguments whether this
particular save was the interesting one, and is invisible to somebody reading
the code that caused it. A history whose entries appear from somewhere you
cannot see is a history you cannot trust.

So every call is at the point the thing actually happened, and you can find
them all with a grep for `record_event`.
"""

import logging

from .models import PackageEvent

logger = logging.getLogger(__name__)


def record_event(package, kind, *, actor=None, at=None, **context):
    """Append one event to an order's history.

    Never raises. This is called from inside the transactions that move
    packages and approve invoices, and a history that can fail the thing it is
    recording is worse than one with a gap in it — losing the record of an
    approval is bad, but refusing the approval because the record could not be
    written is worse. A failure here is logged loudly and swallowed.

    That is the same trade Invoice._queue_render already makes, and for the
    same reason: the decision is the part that must not be lost.

    `at` defaults to now. Pass it only when recording something that happened
    at a time you know and the clock does not — a backfill, or an event derived
    from a stored timestamp.
    """
    if package is None:
        return None

    try:
        return PackageEvent.objects.create(
            package=package,
            kind=kind,
            actor=actor,
            context={k: v for k, v in context.items() if v is not None},
            **({"at": at} if at is not None else {}),
        )
    except Exception:
        logger.exception(
            "Could not record a %s event for package %s. The thing it "
            "describes still happened; only the record of it is missing.",
            kind,
            getattr(package, "pk", "?"),
        )
        return None


def timeline_for(package):
    """Every event on one order, oldest first.

    select_related on the actor because a timeline names the person on almost
    every line, and without it a ten-event history is eleven queries.
    """
    return (
        PackageEvent.objects.filter(package=package)
        .select_related("actor")
        .order_by("at", "id")
    )
