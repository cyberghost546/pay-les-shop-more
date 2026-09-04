"""API tests, with the access boundaries as the main subject."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from config.testing import ThrottleFreeAPITestCase

from .models import Address, Package

User = get_user_model()


# Named locally because every test class in this file already uses the name,
# and the shared base carries the explanation.
ApiTestCase = ThrottleFreeAPITestCase


def make_user(username="jdoe", email="jan@example.com"):
    return User.objects.create_user(
        username=username,
        first_name="Jan",
        last_name="Doe",
        email=email,
        phone_number="+599 9 123 4567",
        password="a-long-enough-password",
    )


class SignupTests(ApiTestCase):
    url = reverse("signup")

    def test_creates_account_and_signs_in(self):
        response = self.client.post(
            self.url,
            {
                "username": "newbie",
                "first_name": "Nieuwe",
                "last_name": "Klant",
                "email": "nieuw@example.com",
                "phone_number": "+599 9 111 2222",
                "password": "a-long-enough-password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("password", response.data)

        # Already signed in, so the profile endpoint answers.
        self.assertEqual(
            self.client.get(reverse("profile")).status_code, status.HTTP_200_OK
        )

    def test_short_password_is_refused(self):
        response = self.client.post(
            self.url,
            {
                "username": "newbie",
                "first_name": "Nieuwe",
                "last_name": "Klant",
                "email": "nieuw@example.com",
                "phone_number": "+599 9 111 2222",
                "password": "short",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertEqual(User.objects.count(), 0)

    def test_duplicate_email_is_refused(self):
        make_user()
        response = self.client.post(
            self.url,
            {
                "username": "other",
                "first_name": "Ander",
                "last_name": "Persoon",
                "email": "jan@example.com",
                "phone_number": "+599 9 111 2222",
                "password": "a-long-enough-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_is_reported_with_a_stable_code(self):
        """The frontend offers "log in instead" off the back of this code.

        Reading it from the message text, or from "there is an error on the
        email field", both break: the message is English and version-specific,
        and an invalid address is also an error on that field.
        """
        make_user()
        response = self.client.post(
            self.url,
            {
                "username": "jan@example.com",
                "first_name": "Ander",
                "last_name": "Persoon",
                "email": "jan@example.com",
                "phone_number": "+599 9 111 2222",
                "password": "a-long-enough-password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("code"), "email_taken")
        # The form has no username input, so an error about one is noise about
        # a field the visitor cannot see.
        self.assertNotIn("username", response.data)

    def test_an_invalid_address_is_not_reported_as_taken(self):
        response = self.client.post(
            self.url,
            {
                "username": "newbie",
                "first_name": "Nieuwe",
                "last_name": "Klant",
                "email": "not-an-address",
                "phone_number": "+599 9 111 2222",
                "password": "a-long-enough-password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertNotIn("code", response.data)

    def test_a_guessable_password_is_reported_on_the_password_field(self):
        """Long enough to pass the form's own check, still refused here.

        The frontend shows this against the password field. It used to fall
        through to "try again later", which is advice that never helps.
        """
        response = self.client.post(
            self.url,
            {
                "username": "newbie",
                "first_name": "Nieuwe",
                "last_name": "Klant",
                "email": "nieuw@example.com",
                "phone_number": "+599 9 111 2222",
                "password": "password1234",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertNotIn("code", response.data)
        self.assertEqual(User.objects.count(), 0)


class LoginTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()

    def test_valid_credentials_sign_in(self):
        response = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "a-long-enough-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "jan@example.com")

    def test_wrong_password_gives_401(self):
        response = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "wrong-password-entirely"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_an_account_can_be_reached_by_its_email_address(self):
        """The login form only ever sends an e-mail address.

        A staff account made with createsuperuser has a username that is not
        an address, so without this nobody could sign in to one — which is
        every account that needs the dashboard.
        """
        staff = User.objects.create_user(
            username="Christopher",
            email="chris@example.com",
            first_name="Chris",
            last_name="Molina",
            phone_number="+599 9 123 4567",
            password="a-long-enough-password",
            is_staff=True,
        )

        response = self.client.post(
            reverse("login"),
            {"username": staff.email, "password": "a-long-enough-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_staff"])

    def test_the_address_is_matched_regardless_of_case(self):
        response = self.client.post(
            reverse("login"),
            {"username": "JAN@Example.COM", "password": "a-long-enough-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_the_username_itself_still_works(self):
        """Signup-created accounts, where username and address are the same."""
        response = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "a-long-enough-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_a_known_address_with_the_wrong_password_is_still_refused(self):
        """The lookup finds the account; it must not stand in for the check."""
        response = self.client.post(
            reverse("login"),
            {"username": "jan@example.com", "password": "wrong-password-entirely"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_user_and_wrong_password_are_indistinguishable(self):
        """Different responses here would let someone enumerate customers."""
        wrong_password = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "wrong-password-entirely"},
            format="json",
        )
        no_such_user = self.client.post(
            reverse("login"),
            {"username": "nobody", "password": "wrong-password-entirely"},
            format="json",
        )

        self.assertEqual(wrong_password.status_code, no_such_user.status_code)
        self.assertEqual(wrong_password.data, no_such_user.data)


class ProfileTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()

    def test_requires_authentication(self):
        self.assertEqual(
            self.client.get(reverse("profile")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_returns_own_profile_with_addresses(self):
        Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "jdoe")
        self.assertEqual(len(response.data["addresses"]), 1)

    def test_can_update_own_details(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("profile"), {"first_name": "Janneke"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Janneke")

    def test_username_cannot_be_changed(self):
        self.client.force_authenticate(self.user)
        self.client.patch(reverse("profile"), {"username": "hacker"}, format="json")

        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "jdoe")


class PasswordChangeTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_wrong_current_password_is_refused(self):
        response = self.client.post(
            reverse("password"),
            {
                "current_password": "not-the-right-one",
                "new_password": "a-brand-new-long-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-long-enough-password"))

    def test_changes_password_with_correct_current(self):
        response = self.client.post(
            reverse("password"),
            {
                "current_password": "a-long-enough-password",
                "new_password": "a-brand-new-long-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-brand-new-long-password"))


class AddressAccessTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.other = make_user(username="other", email="other@example.com")

        self.mine = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        self.theirs = Address.objects.create(
            user=self.other, street="Kaya Grandi", house_number="2", city="Kralendijk"
        )

        self.client.force_authenticate(self.user)

    def test_list_shows_only_my_addresses(self):
        response = self.client.get(reverse("address-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.mine.id)

    def test_cannot_read_someone_elses_address(self):
        response = self.client.get(reverse("address-detail", args=[self.theirs.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_someone_elses_address(self):
        response = self.client.delete(reverse("address-detail", args=[self.theirs.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Address.objects.filter(pk=self.theirs.pk).exists())

    def test_created_address_belongs_to_the_caller(self):
        """Even when the request body claims a different owner."""
        response = self.client.post(
            reverse("address-list"),
            {
                "street": "Nieuwestraat",
                "house_number": "3",
                "city": "Willemstad",
                "country": "CW",
                "user": self.other.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Address.objects.get(pk=response.data["id"]).user, self.user)

    def test_customer_can_hold_several_addresses(self):
        self.client.post(
            reverse("address-list"),
            {"street": "Nieuwestraat", "house_number": "3", "city": "Willemstad"},
            format="json",
        )
        self.assertEqual(self.user.addresses.count(), 2)


class PackageAccessTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.other = make_user(username="other", email="other@example.com")

        address = Address.objects.create(
            user=self.other, street="Kaya Grandi", house_number="2", city="Kralendijk"
        )
        self.theirs = Package.objects.create(
            user=self.other, delivery_address=address, tracking_number="PLSM-0002"
        )

        self.client.force_authenticate(self.user)

    def test_list_excludes_other_customers_packages(self):
        response = self.client.get(reverse("package-list"))
        self.assertEqual(response.data["count"], 0)

    def test_cannot_read_someone_elses_package(self):
        response = self.client.get(reverse("package-detail", args=[self.theirs.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_packages_are_read_only(self):
        response = self.client.post(
            reverse("package-list"), {"tracking_number": "PLSM-9999"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class NotificationPreferenceTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_defaults_are_shipping_on_marketing_off(self):
        """Marketing must be opt-in; order updates are about the customer's
        own order and start on."""
        response = self.client.get(reverse("profile"))
        self.assertTrue(response.data["notify_shipping"])
        self.assertFalse(response.data["notify_offers"])
        self.assertFalse(response.data["notify_newsletter"])

    def test_preferences_can_be_changed(self):
        response = self.client.patch(
            reverse("profile"),
            {"notify_offers": True, "notify_shipping": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.notify_offers)
        self.assertFalse(self.user.notify_shipping)


class AccountDeleteTests(ApiTestCase):
    url = reverse("account-delete")

    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_requires_the_current_password(self):
        response = self.client.post(
            self.url, {"current_password": "not-the-right-one"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        response = self.client.post(
            self.url, {"current_password": "a-long-enough-password"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_without_shipments_is_deleted_outright(self):
        Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )

        response = self.client.post(
            self.url, {"current_password": "a-long-enough-password"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["anonymised"])
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertEqual(Address.objects.count(), 0)

    def test_customer_with_shipments_is_anonymised_not_deleted(self):
        address = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        Package.objects.create(
            user=self.user, delivery_address=address, tracking_number="PLSM-0001"
        )

        response = self.client.post(
            self.url, {"current_password": "a-long-enough-password"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["anonymised"])

        self.user.refresh_from_db()

        # Every piece of personal data is gone...
        self.assertEqual(self.user.first_name, "")
        self.assertEqual(self.user.last_name, "")
        self.assertEqual(self.user.phone_number, "")
        self.assertNotIn("jan@example.com", self.user.email)
        self.assertNotEqual(self.user.username, "jdoe")
        self.assertEqual(self.user.addresses.count(), 0)
        self.assertIsNotNone(self.user.anonymised_at)

        # ...but the shipment record survives, with where it was sent.
        self.assertEqual(Package.objects.count(), 1)
        package = Package.objects.get()
        self.assertIn("Hertzstraat 10", package.delivery_address_text)

    def test_anonymised_account_cannot_be_logged_into(self):
        address = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        Package.objects.create(
            user=self.user, delivery_address=address, tracking_number="PLSM-0001"
        )
        self.client.post(
            self.url, {"current_password": "a-long-enough-password"}, format="json"
        )

        self.client.force_authenticate(None)
        response = self.client.post(
            reverse("login"),
            {"username": "jdoe", "password": "a-long-enough-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deleting_ends_the_session(self):
        self.client.post(
            self.url, {"current_password": "a-long-enough-password"}, format="json"
        )
        # force_authenticate bypasses sessions, so drop it to test the real
        # cookie path.
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(reverse("profile")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_a_second_customer_can_also_be_anonymised(self):
        """The replacement username and e-mail are unique per row, so two
        erasures must not collide."""
        other = make_user(username="other", email="other@example.com")
        for user in (self.user, other):
            address = Address.objects.create(
                user=user, street="Kaya Grandi", house_number="2", city="Kralendijk"
            )
            Package.objects.create(
                user=user,
                delivery_address=address,
                tracking_number=f"PLSM-{user.pk}",
            )
            user.anonymise()

        self.assertEqual(User.objects.filter(anonymised_at__isnull=False).count(), 2)
