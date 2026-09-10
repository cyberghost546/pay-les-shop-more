"""Turning a notification into the words that go in an e-mail.

English only, and only for e-mail. The React app renders the same `kind` and
`context` in the reader's own language — see the `notifications` block in
frontend/src/i18n/translations.js, which has to be kept in step with the kinds
below. There is no server-side translation because there is nowhere to read a
language from: a User has no language field, and the one the browser was set to
when the package moved is not something the worker knows.

Kept apart from tasks.py so that what a message says can be tested without an
outbox, and apart from models.py so that a wording change is not a migration.
"""

from django.conf import settings

from .models import Notification

# Fallback for a status that has no sentence here yet — a new Package.Status
# added later, for instance. Better a plain, correct line than a KeyError on a
# worker at two in the morning.
_DEFAULT_SHIPMENT_LINE = "There is an update on your shipment."

# One line per status, in the customer's terms rather than the database's.
# Keys are Package.Status values; kept as literals because this module is about
# wording and should not drag the accounts app in to say a sentence.
SHIPMENT_LINES = {
    "quoted": "We have prepared a quote for your shipment.",
    "paid": "We have received your payment. Your shipment is being prepared.",
    "purchased": "Your products have been purchased.",
    "ready_for_shipping": (
        "Your shipment is packed and waiting to leave. It can no longer be "
        "added to - anything bought now travels as a separate shipment."
    ),
    "in_transit": "Your shipment is on its way.",
    "arrived": "Your shipment has arrived at its destination.",
    "delivered": "Your shipment has been delivered.",
    "cancelled": "Your shipment has been cancelled.",
}

SHIPMENT_SUBJECTS = {
    "quoted": "Your quote is ready",
    "paid": "Payment received",
    "purchased": "Your products have been purchased",
    "ready_for_shipping": "Your shipment is packed and ready to leave",
    "in_transit": "Your shipment is on its way",
    "arrived": "Your shipment has arrived",
    "delivered": "Your shipment has been delivered",
    "cancelled": "Your shipment has been cancelled",
}


def _tracking(context):
    return context.get("tracking_number") or ""


def subject_for(notification):
    """The e-mail subject line."""
    context = notification.context or {}

    if notification.kind == Notification.Kind.INVOICE_SENT:
        number = context.get("invoice_number") or "your shipment"
        return f"Invoice {number}"

    subject = SHIPMENT_SUBJECTS.get(context.get("status"), "Shipment update")
    tracking = _tracking(context)
    return f"{subject} ({tracking})" if tracking else subject


def body_for(notification):
    """The plain-text e-mail body.

    Plain text, not HTML: the site sends one other e-mail (the password reset)
    and it is plain text too, so this needs no template engine, renders in
    every client, and cannot leak a tracking pixel into a message about
    somebody's money.
    """
    context = notification.context or {}
    tracking = _tracking(context)

    lines = [f"Hello {notification.user.get_full_name() or ''}".strip() + ",", ""]

    if notification.kind == Notification.Kind.INVOICE_SENT:
        number = context.get("invoice_number")
        lines.append(
            f"Your invoice {number} is ready." if number else "Your invoice is ready."
        )
        if tracking:
            lines.append(f"It covers shipment {tracking}.")
        lines += [
            "",
            "You can download it from your profile page:",
            f"{settings.FRONTEND_URL}/profile#invoices",
        ]
    else:
        lines.append(SHIPMENT_LINES.get(context.get("status"), _DEFAULT_SHIPMENT_LINE))
        if tracking:
            lines += [
                "",
                f"Tracking number: {tracking}",
                f"{settings.FRONTEND_URL}/tracking?number={tracking}",
            ]

    lines += [
        "",
        "You can change which e-mails you receive on your profile page:",
        f"{settings.FRONTEND_URL}/profile#notifications",
        "",
        "PayLesShopMore.com",
    ]

    return "\n".join(lines)
