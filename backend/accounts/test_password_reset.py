"""Tests for the password-reset flow.

Two things carry the weight here: that the endpoint never reveals which
addresses are registered, and that a link stops working once it has been used.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import (
    PasswordResetTokenGenerator,
    default_token_generator,
)
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status

from .emails import reset_link
from .test_api import ApiTestCase, make_user

User = get_user_model()

REQUEST_URL = reverse("password-reset")
CONFIRM_URL = reverse("password-reset-confirm")

NEW_PASSWORD = "a-completely-new-password"


def link_parts(user):
    """The uid and token as they appear in the e-mailed URL."""
    return (
        urlsafe_base64_encode(force_bytes(user.pk)),
        default_token_generator.make_token(user),
    )


class PasswordResetRequestTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        mail.outbox.clear()

    def test_sends_a_link_to_a_registered_address(self):
        response = self.client.post(
            REQUEST_URL, {"email": "jan@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["jan@example.com"])
        self.assertIn("/reset-password/", mail.outbox[0].body)

    def test_unknown_address_looks_identical_and_sends_nothing(self):
        """The response must not say whether an account exists."""
        known = self.client.post(
            REQUEST_URL, {"email": "jan@example.com"}, format="json"
        )
        mail.outbox.clear()
        unknown = self.client.post(
            REQUEST_URL, {"email": "nobody@example.com"}, format="json"
        )

        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.content, unknown.content)
        self.assertEqual(len(mail.outbox), 0)

    def test_address_matching_is_case_insensitive(self):
        self.client.post(REQUEST_URL, {"email": "JAN@Example.COM"}, format="json")
        self.assertEqual(len(mail.outbox), 1)

    def test_nothing_is_sent_to_an_anonymised_account(self):
        """An erased account has no password to reset."""
        self.user.anonymise()

        response = self.client.post(
            REQUEST_URL, {"email": "jan@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 0)

    def test_nothing_is_sent_to_a_deactivated_account(self):
        self.user.is_active = False
        self.user.save()

        self.client.post(REQUEST_URL, {"email": "jan@example.com"}, format="json")
        self.assertEqual(len(mail.outbox), 0)

    def test_a_malformed_address_is_rejected(self):
        response = self.client.post(REQUEST_URL, {"email": "nonsense"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_mail_is_written_in_the_requested_language(self):
        self.client.post(
            REQUEST_URL, {"email": "jan@example.com", "language": "pap"}, format="json"
        )
        self.assertIn("kontraseña", mail.outbox[0].body)

    def test_an_unknown_language_falls_back_rather_than_failing(self):
        self.client.post(
            REQUEST_URL, {"email": "jan@example.com", "language": "de"}, format="json"
        )
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(FRONTEND_URL="https://paylesshopmore.com")
    def test_the_link_points_at_the_configured_frontend(self):
        """It is opened from a mail client, so it has to be absolute."""
        self.assertTrue(
            reset_link(self.user).startswith(
                "https://paylesshopmore.com/reset-password/"
            )
        )


class PasswordResetConfirmTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.uid, self.token = link_parts(self.user)

    def confirm(self, **overrides):
        payload = {
            "uid": self.uid,
            "token": self.token,
            "new_password": NEW_PASSWORD,
        }
        payload.update(overrides)
        return self.client.post(CONFIRM_URL, payload, format="json")

    def test_sets_the_new_password(self):
        response = self.confirm()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

    def test_the_old_password_stops_working(self):
        self.confirm()
        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("a-long-enough-password"))

    def test_the_new_password_can_be_logged_in_with(self):
        self.confirm()

        response = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": NEW_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_it_does_not_sign_the_visitor_in(self):
        """Holding the link earns the right to set a password, not a session."""
        self.confirm()
        self.assertEqual(
            self.client.get(reverse("profile")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_a_link_cannot_be_used_twice(self):
        self.assertEqual(self.confirm().status_code, status.HTTP_204_NO_CONTENT)

        # The token is derived from the password hash, so setting a new
        # password is what retires it.
        second = self.confirm(new_password="yet-another-password-here")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_tampered_token_is_refused(self):
        response = self.confirm(token="not-a-real-token")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-long-enough-password"))

    def test_another_accounts_token_is_refused(self):
        """The uid and the token have to belong to each other."""
        other = make_user(username="other", email="other@example.com")
        _, other_token = link_parts(other)

        self.assertEqual(
            self.confirm(token=other_token).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_a_uid_that_is_not_a_number_is_refused_not_crashed(self):
        """The uid is whatever was in the URL, so it can be any text at all."""
        response = self.confirm(uid=urlsafe_base64_encode(b"not-a-number"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_uid_that_is_not_base64_is_refused_not_crashed(self):
        response = self.confirm(uid="!!!!")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_unknown_account_and_a_bad_token_look_the_same(self):
        missing = self.confirm(uid=urlsafe_base64_encode(force_bytes(999999)))
        bad_token = self.confirm(token="not-a-real-token")

        self.assertEqual(missing.status_code, bad_token.status_code)
        self.assertEqual(missing.content, bad_token.content)

    def test_a_guessable_new_password_is_refused(self):
        response = self.confirm(new_password="password1234")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-long-enough-password"))

    def test_a_short_new_password_is_refused(self):
        self.assertEqual(
            self.confirm(new_password="short").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_resetting_ends_sessions_opened_with_the_old_password(self):
        """The point of a reset, when the reason for it was somebody else
        being in the account."""
        self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "a-long-enough-password"},
            format="json",
        )
        self.assertEqual(
            self.client.get(reverse("profile")).status_code, status.HTTP_200_OK
        )

        # Issued after the login, because logging in is itself enough to
        # retire an older link — see the test below.
        self.user.refresh_from_db()
        uid, token = link_parts(self.user)

        self.assertEqual(
            self.confirm(uid=uid, token=token).status_code,
            status.HTTP_204_NO_CONTENT,
        )
        self.assertEqual(
            self.client.get(reverse("profile")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_logging_in_retires_an_outstanding_link(self):
        """Django's token covers last_login as well as the password hash.

        So someone who remembers their password after asking for a reset
        cancels the link simply by using it — the mail cannot be turned
        against them later.
        """
        self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "a-long-enough-password"},
            format="json",
        )

        self.assertEqual(self.confirm().status_code, status.HTTP_400_BAD_REQUEST)


class PasswordResetExpiryTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()

    def test_an_expired_link_is_refused(self):
        """Checked by moving the clock the generator reads, rather than by
        setting the timeout to zero — a zero timeout compares equal, not
        greater, so a token made in the same second still passes."""
        uid, token = link_parts(self.user)

        two_hours_on = PasswordResetTokenGenerator()._now() + timedelta(hours=2)
        with patch.object(
            PasswordResetTokenGenerator, "_now", return_value=two_hours_on
        ):
            response = self.client.post(
                CONFIRM_URL,
                {"uid": uid, "token": token, "new_password": NEW_PASSWORD},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-long-enough-password"))
