"""Tests for the staff dashboard API.

The thing most worth proving here is the negative case: that a signed-in
customer who is not staff cannot reach any of it. Everything else in the
dashboard is convenience; that boundary is the feature.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Address, Package
from enquiries.models import ContactMessage, QuoteRequest

User = get_user_model()


class StaffApiTestCase(APITestCase):
    """Shared fixtures: one customer, one staff member, one row of each kind."""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
            first_name="Voorbeeld",
            last_name="Klant",
            phone_number="+599 9 123 4567",
        )
        self.staff = User.objects.create_user(
            username="agent@example.com",
            email="agent@example.com",
            password="a-long-enough-password",
            first_name="Back",
            last_name="Office",
            phone_number="+599 9 765 4321",
            is_staff=True,
        )

        self.quote = QuoteRequest.objects.create(
            destination="Curaçao",
            first_name="Voorbeeld",
            last_name="Klant",
            email="klant@example.com",
            message="Graag een offerte voor twee dozen.",
        )
        self.message = ContactMessage.objects.create(
            name="Voorbeeld Klant",
            email="klant@example.com",
            subject="Vraag",
            message="Hoe lang duurt verzending naar Bonaire?",
        )
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Twee dozen",
        )


class PermissionTests(StaffApiTestCase):
    """Nobody without is_staff gets in, whatever the route."""

    def urls(self):
        return [
            reverse("staff-overview"),
            reverse("staff-quote-list"),
            reverse("staff-message-list"),
            reverse("staff-package-list"),
            reverse("staff-customer-list"),
        ]

    def test_anonymous_is_refused(self):
        for url in self.urls():
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(
                    response.status_code,
                    {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
                )

    def test_signed_in_customer_is_refused(self):
        """The case that matters: a real session, but not a staff one."""
        self.client.force_authenticate(self.customer)

        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code, status.HTTP_403_FORBIDDEN
                )

    def test_customer_cannot_reach_another_customers_package(self):
        self.client.force_authenticate(self.customer)
        url = reverse("staff-package-detail", args=[self.package.pk])
        # Their own package — still 403, because the route is staff-only
        # rather than owner-scoped.
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_staff_is_refused(self):
        self.staff.is_active = False
        self.staff.save()
        self.client.force_authenticate(self.staff)

        self.assertEqual(
            self.client.get(reverse("staff-overview")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_staff_gets_in(self):
        self.client.force_authenticate(self.staff)

        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)


class OverviewTests(StaffApiTestCase):
    def test_counts_reflect_the_database(self):
        self.client.force_authenticate(self.staff)
        data = self.client.get(reverse("staff-overview")).json()

        self.assertEqual(data["quotes"]["total"], 1)
        self.assertEqual(data["quotes"]["new"], 1)
        self.assertEqual(data["messages"]["unhandled"], 1)
        self.assertEqual(data["packages"]["total"], 1)
        self.assertEqual(len(data["recent_packages"]), 1)

    def test_anonymised_customers_are_not_counted(self):
        self.client.force_authenticate(self.staff)
        before = self.client.get(reverse("staff-overview")).json()["customers"]["total"]

        self.customer.anonymise()

        after = self.client.get(reverse("staff-overview")).json()["customers"]["total"]
        self.assertEqual(after, before - 1)


class ListTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.staff)

    def test_search_matches_across_fields(self):
        QuoteRequest.objects.create(
            destination="Aruba",
            first_name="Iemand",
            last_name="Anders",
            email="anders@example.com",
        )

        response = self.client.get(reverse("staff-quote-list"), {"search": "Anders"})
        results = response.json()["results"]

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["email"], "anders@example.com")

    def test_status_filter(self):
        QuoteRequest.objects.create(
            destination="Aruba",
            first_name="Iemand",
            last_name="Anders",
            email="anders@example.com",
            status=QuoteRequest.Status.QUOTED,
        )

        response = self.client.get(reverse("staff-quote-list"), {"status": "quoted"})
        self.assertEqual(len(response.json()["results"]), 1)

    def test_handled_filter_reads_false_as_false(self):
        """A plain `filter(handled="false")` would be True — hence the special
        case in the view."""
        ContactMessage.objects.create(
            name="Ander",
            email="ander@example.com",
            subject="Vraag",
            message="Nog een vraag hier.",
            handled=True,
        )

        unhandled = self.client.get(
            reverse("staff-message-list"), {"handled": "false"}
        ).json()["results"]

        self.assertEqual(len(unhandled), 1)
        self.assertFalse(unhandled[0]["handled"])

    def test_unknown_ordering_is_ignored(self):
        """Not an error, and not obeyed: sorting is an allow-list."""
        response = self.client.get(
            reverse("staff-package-list"), {"ordering": "user__password"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_package_list_includes_the_customer(self):
        results = self.client.get(reverse("staff-package-list")).json()["results"]

        self.assertEqual(results[0]["customer"]["email"], "klant@example.com")
        # A password hash has no business leaving the server, in any shape.
        self.assertNotIn("password", results[0]["customer"])


class UpdateTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.staff)

    def test_quote_status_can_change_but_the_submission_cannot(self):
        url = reverse("staff-quote-detail", args=[self.quote.pk])

        response = self.client.patch(
            url, {"status": "quoted", "email": "attacker@example.com"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.status, "quoted")
        # The e-mail is read-only, so it was ignored rather than applied.
        self.assertEqual(self.quote.email, "klant@example.com")

    def test_marking_a_message_handled(self):
        url = reverse("staff-message-detail", args=[self.message.pk])

        self.client.patch(url, {"handled": True})

        self.message.refresh_from_db()
        self.assertTrue(self.message.handled)

    def test_moving_a_package_to_in_transit_stamps_shipped_at(self):
        url = reverse("staff-package-detail", args=[self.package.pk])

        self.client.patch(url, {"status": "in_transit"})

        self.package.refresh_from_db()
        self.assertIsNotNone(self.package.shipped_at)
        self.assertIsNone(self.package.delivered_at)

    def test_the_shipped_date_is_not_overwritten_on_a_later_change(self):
        url = reverse("staff-package-detail", args=[self.package.pk])

        self.client.patch(url, {"status": "in_transit"})
        self.package.refresh_from_db()
        first = self.package.shipped_at

        self.client.patch(url, {"status": "delivered"})
        self.package.refresh_from_db()

        self.assertEqual(self.package.shipped_at, first)
        self.assertIsNotNone(self.package.delivered_at)

    def test_tracking_number_is_read_only(self):
        url = reverse("staff-package-detail", args=[self.package.pk])

        self.client.patch(url, {"tracking_number": "PLSM-9999"})

        self.package.refresh_from_db()
        self.assertEqual(self.package.tracking_number, "PLSM-0001")

    def test_nothing_can_be_deleted(self):
        for name, pk in [
            ("staff-quote-detail", self.quote.pk),
            ("staff-message-detail", self.message.pk),
            ("staff-package-detail", self.package.pk),
        ]:
            with self.subTest(name=name):
                response = self.client.delete(reverse(name, args=[pk]))
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )


class CustomerTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.address = Address.objects.create(
            user=self.customer,
            label="Thuis",
            street="Kaya Grandi",
            house_number="24",
            postal_code="0000",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )
        self.client.force_authenticate(self.staff)

    def rows(self, **params):
        return self.client.get(reverse("staff-customer-list"), params).json()["results"]

    def find(self, username):
        return next(row for row in self.rows() if row["username"] == username)

    def test_the_list_carries_username_name_and_contact_details(self):
        row = self.find("klant@example.com")

        self.assertEqual(row["username"], "klant@example.com")
        self.assertEqual(row["name"], "Voorbeeld Klant")
        self.assertEqual(row["first_name"], "Voorbeeld")
        self.assertEqual(row["last_name"], "Klant")
        self.assertEqual(row["email"], "klant@example.com")
        self.assertEqual(row["phone_number"], "+599 9 123 4567")

    def test_addresses_come_with_the_customer(self):
        [address] = self.find("klant@example.com")["addresses"]

        self.assertEqual(address["street"], "Kaya Grandi")
        self.assertEqual(address["house_number"], "24")
        self.assertEqual(address["city"], "Willemstad")
        self.assertEqual(address["country"], "CW")
        # The readable label, so the table does not have to know the codes.
        self.assertEqual(address["country_display"], "Curaçao")
        self.assertTrue(address["is_default"])

    def test_a_customer_with_several_addresses_shows_them_all(self):
        Address.objects.create(
            user=self.customer,
            label="Werk",
            street="Schottegatweg",
            house_number="112",
            city="Willemstad",
            country=Address.Country.CURACAO,
        )

        self.assertEqual(len(self.find("klant@example.com")["addresses"]), 2)

    def test_the_shipment_count_is_included(self):
        self.assertEqual(self.find("klant@example.com")["package_count"], 1)
        self.assertEqual(self.find("agent@example.com")["package_count"], 0)

    def test_no_password_hash_ever_leaves_the_server(self):
        body = self.client.get(reverse("staff-customer-list")).content.decode()

        self.assertNotIn("password", body)
        self.assertNotIn("pbkdf2", body)

    def test_search_matches_name_email_and_phone(self):
        for term in ["Voorbeeld", "klant@example", "123 4567"]:
            with self.subTest(term=term):
                results = self.rows(search=term)
                self.assertIn("klant@example.com", [row["username"] for row in results])

    def test_search_matches_the_address(self):
        results = self.rows(search="Kaya Grandi")
        self.assertEqual([row["username"] for row in results], ["klant@example.com"])

    def test_a_customer_with_two_matching_addresses_appears_once(self):
        """Searching the address table joins it, which would otherwise repeat
        the customer once per address that matched."""
        Address.objects.create(
            user=self.customer,
            street="Kaya Grandi",
            house_number="99",
            city="Willemstad",
            country=Address.Country.CURACAO,
        )

        self.assertEqual(len(self.rows(search="Kaya Grandi")), 1)

    def test_erased_accounts_are_marked_and_can_be_filtered_out(self):
        self.customer.anonymise()

        erased = next(row for row in self.rows() if row["is_erased"])
        self.assertTrue(erased["is_erased"])
        # anonymise() deletes the addresses; the package keeps its own frozen
        # copy of where it went.
        self.assertEqual(erased["addresses"], [])

        remaining = [row["is_erased"] for row in self.rows(erased="false")]
        self.assertNotIn(True, remaining)

    def test_staff_accounts_can_be_singled_out(self):
        results = self.rows(staff="true")
        self.assertEqual([row["username"] for row in results], ["agent@example.com"])

    def test_customers_are_read_only(self):
        url = reverse("staff-customer-detail", args=[self.customer.pk])

        for method in [self.client.patch, self.client.put]:
            with self.subTest(method=method.__name__):
                response = method(url, {"first_name": "Changed"}, format="json")
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )

        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, "Voorbeeld")
