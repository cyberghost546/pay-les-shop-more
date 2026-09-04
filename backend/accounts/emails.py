"""The password-reset e-mail.

Plain text, in the language the visitor was reading when they asked. Kept in a
dict here rather than in template files because it is one short message per
language and the three read better side by side, where a change to one is an
obvious prompt to change the others.

Nothing here is ever rendered as HTML, so the name — which the account holder
chose, and which nobody else can influence — needs no escaping.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

# Falls back to Dutch, which is what the site defaults to.
DEFAULT_LANGUAGE = "nl"

MESSAGES = {
    "nl": {
        "subject": "Uw wachtwoord opnieuw instellen",
        "body": (
            "Hallo {name},\n\n"
            "U heeft gevraagd om uw wachtwoord opnieuw in te stellen. "
            "Open de onderstaande link om een nieuw wachtwoord te kiezen:\n\n"
            "{link}\n\n"
            "Deze link is {hours} uur geldig en kan één keer worden gebruikt.\n\n"
            "Heeft u dit niet zelf aangevraagd? Dan hoeft u niets te doen — "
            "uw wachtwoord blijft ongewijzigd.\n\n"
            "Met vriendelijke groet,\n"
            "PayLesShopMore.com"
        ),
    },
    "en": {
        "subject": "Reset your password",
        "body": (
            "Hello {name},\n\n"
            "You asked to reset your password. Open the link below to choose "
            "a new one:\n\n"
            "{link}\n\n"
            "This link is valid for {hours} hour(s) and can be used once.\n\n"
            "If this was not you, there is nothing to do — your password stays "
            "as it is.\n\n"
            "Kind regards,\n"
            "PayLesShopMore.com"
        ),
    },
    "pap": {
        "subject": "Pone bo kontraseña di nobo",
        "body": (
            "Kon ta {name},\n\n"
            "Bo a pidi pa pone bo kontraseña di nobo. Habri e link akibou pa "
            "skohe un kontraseña nobo:\n\n"
            "{link}\n\n"
            "E link aki ta bálido pa {hours} ora i por wòrdu usá un biaha.\n\n"
            "Si no ta bo a pidi esaki, no tin nada pa hasi — bo kontraseña ta "
            "keda meskos.\n\n"
            "Saludo,\n"
            "PayLesShopMore.com"
        ),
    },
}


def reset_link(user):
    """The URL in the e-mail.

    The token is Django's own. Two properties matter: it is derived from the
    account's current password hash and last-login time, so using it once (or
    changing the password any other way) makes it stop working; and it is
    signed, so it cannot be forged without the secret key.
    """
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    return f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"


def send_password_reset(user, language=""):
    """Send the reset mail. Returns nothing; failures are not the caller's
    business to report, for the reason described in the view."""
    copy = MESSAGES.get(language) or MESSAGES[DEFAULT_LANGUAGE]

    # Round up, so a 90-minute timeout does not advertise itself as one hour.
    hours = max(1, -(-settings.PASSWORD_RESET_TIMEOUT // 3600))

    send_mail(
        subject=copy["subject"],
        message=copy["body"].format(
            name=user.first_name or user.get_username(),
            link=reset_link(user),
            hours=hours,
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        # The view answers the same way whether or not the mail went out, so a
        # broken mail server must not turn into a 500 that says "this address
        # exists, and something went wrong for it".
        fail_silently=True,
    )
