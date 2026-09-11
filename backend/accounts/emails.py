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


# The e-mail that a staff member creating an account sends.
#
# The same link as the reset above, and the same token, which is what keeps
# this to one mechanism rather than two: an account created in the back office
# has no usable password, so choosing a first one and replacing a forgotten one
# are the same act. Only the words differ, and they have to - "you asked to
# reset your password", sent to somebody who asked for nothing, reads as a
# break-in.
#
# The link is as short-lived as a reset link, which is short for something that
# travels by e-mail and gets read hours later. That is a deliberate trade
# rather than an oversight: a second, longer-lived token would be a second
# thing to get right and to keep safe, and the cost of not having one is small
# because the account exists from the moment it is created. So every message
# below says what to do when the link has expired, and the answer is the
# ordinary forgot-password form.
INVITE_MESSAGES = {
    "nl": {
        "subject": "Uw account bij PayLesShopMore.com",
        "body": (
            "Hallo {name},\n\n"
            "Er is een account voor u aangemaakt bij PayLesShopMore.com. "
            "Kies hieronder uw wachtwoord om het in gebruik te nemen:\n\n"
            "{link}\n\n"
            "Deze link is {hours} uur geldig en kan één keer worden gebruikt. "
            "Is de link verlopen? Kies dan 'Wachtwoord vergeten' op de "
            "inlogpagina, dan ontvangt u een nieuwe.\n\n"
            "U logt in met dit e-mailadres: {username}\n\n"
            "Met vriendelijke groet,\n"
            "PayLesShopMore.com"
        ),
    },
    "en": {
        "subject": "Your PayLesShopMore.com account",
        "body": (
            "Hello {name},\n\n"
            "An account has been created for you at PayLesShopMore.com. "
            "Choose your password below to start using it:\n\n"
            "{link}\n\n"
            "This link is valid for {hours} hour(s) and can be used once. If "
            "it has expired, choose 'Forgot password' on the sign-in page and "
            "a new one will be sent.\n\n"
            "You sign in with this e-mail address: {username}\n\n"
            "Kind regards,\n"
            "PayLesShopMore.com"
        ),
    },
    "pap": {
        "subject": "Bo kuenta na PayLesShopMore.com",
        "body": (
            "Kon ta {name},\n\n"
            "Nos a traha un kuenta pa bo na PayLesShopMore.com. Skohe bo "
            "kontraseña akibou pa kuminsá us'e:\n\n"
            "{link}\n\n"
            "E link aki ta bálido pa {hours} ora i por wòrdu usá un biaha. Si "
            "e link a vense, skohe 'Wachtwoord vergeten' riba e página di "
            "login pa haña un nobo.\n\n"
            "Bo ta drenta ku e email aki: {username}\n\n"
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


def _valid_hours():
    """How long a link lasts, in whole hours.

    Rounded up, so a 90-minute timeout does not advertise itself as one hour,
    and floored at one so a short one does not promise zero.
    """
    return max(1, -(-settings.PASSWORD_RESET_TIMEOUT // 3600))


def send_account_invite(user, language=""):
    """Tell somebody an account has been made for them, and let them into it.

    Sent by the back office when it creates an account, which is the only way
    an account comes into being without its owner choosing a password. The
    account is left with no usable password until this link is followed, so
    nobody - not the office, not the person who pressed the button - ever
    knows what it becomes.

    fail_silently, like the reset below: the account has been created and
    committed by the time this runs, and a mail server having a bad afternoon
    must not turn a created account into a 500. The dashboard says plainly
    that the invitation may not have arrived, and the office can send it again
    from the forgot-password form.
    """
    copy = INVITE_MESSAGES.get(language) or INVITE_MESSAGES[DEFAULT_LANGUAGE]

    send_mail(
        subject=copy["subject"],
        message=copy["body"].format(
            name=user.first_name or user.get_username(),
            link=reset_link(user),
            hours=_valid_hours(),
            username=user.get_username(),
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def send_password_reset(user, language=""):
    """Send the reset mail. Returns nothing; failures are not the caller's
    business to report, for the reason described in the view."""
    copy = MESSAGES.get(language) or MESSAGES[DEFAULT_LANGUAGE]

    hours = _valid_hours()

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
