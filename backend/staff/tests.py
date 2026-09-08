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

    def test_customers_cannot_be_deleted(self):
        """Erasure is the customer's own action, on their profile page.

        It anonymises rather than deletes, because the shipment records have
        to survive it. A DELETE here would take those with it.
        """
        url = reverse("staff-customer-detail", args=[self.customer.pk])

        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )
        self.assertTrue(User.objects.filter(pk=self.customer.pk).exists())


class RaiseInvoiceTests(StaffApiTestCase):
    """Getting an invoice for a shipment that never passed through the
    dashboard's own paid transition.

    A row seeded straight into `paid`, imported, or set in the Django admin
    has no invoice and — before this action — no way to get one, because every
    other invoice control lives on the queue and the queue was empty.
    """

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.staff)
        # Straight into paid, the way seeded and imported rows arrive: no
        # transition, so nothing raised an invoice for it.
        self.paid = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-SEEDED-1",
            status=Package.Status.PAID,
            value_eur="250.00",
        )

    def url(self, package):
        return reverse("staff-package-invoice", args=[package.pk])

    def test_staff_can_raise_an_invoice_for_a_paid_shipment(self):
        response = self.client.post(self.url(self.paid))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["status"], "pending_review")
        self.assertEqual(response.json()["tracking_number"], "PLSM-SEEDED-1")

    def test_it_lands_in_the_review_queue(self):
        """Which is the whole point: somewhere to upload the document."""
        self.client.post(self.url(self.paid))

        queue = self.client.get(reverse("staff-invoice-list")).json()["results"]

        self.assertIn("PLSM-SEEDED-1", [row["tracking_number"] for row in queue])

    def test_pressing_it_twice_does_not_raise_a_second_invoice(self):
        first = self.client.post(self.url(self.paid))
        second = self.client.post(self.url(self.paid))

        self.assertEqual(first.json()["id"], second.json()["id"])

    def test_a_shipment_still_only_quoted_is_refused(self):
        """A customer holding a quote they have not acted on owes nothing.
        Billing for it would be inventing a debt."""
        quoted = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-SEEDED-2",
            status=Package.Status.QUOTED,
            value_eur="99.00",
        )

        response = self.client.post(self.url(quoted))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_cancelled_shipment_is_refused(self):
        cancelled = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-SEEDED-3",
            status=Package.Status.CANCELLED,
            value_eur="99.00",
        )

        response = self.client.post(self.url(cancelled))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_customer_cannot_raise_an_invoice(self):
        self.client.force_authenticate(self.customer)

        response = self.client.post(self.url(self.paid))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_package_row_says_whether_there_is_an_invoice(self):
        """What the Packages page reads to choose between offering to raise
        one and pointing at the one that exists."""
        before = self.client.get(reverse("staff-package-list")).json()["results"]
        row = next(r for r in before if r["tracking_number"] == "PLSM-SEEDED-1")
        self.assertIsNone(row["invoice"])

        self.client.post(self.url(self.paid))

        after = self.client.get(reverse("staff-package-list")).json()["results"]
        row = next(r for r in after if r["tracking_number"] == "PLSM-SEEDED-1")
        self.assertEqual(row["invoice"]["status"], "pending_review")


class CustomerMoneyTests(StaffApiTestCase):
    """What a customer has paid and what they still owe, on their row.

    The figures are what the search is for: a name goes in, and the answer is
    this person and where they stand.
    """

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.staff)

        # StaffApiTestCase already gives this customer PLSM-0001: quoted,
        # with no value_eur set. It is deliberately left in — a priced total
        # has to survive an unpriced row sitting beside it — so their shipment
        # count is one higher than the four raised here.
        self.INHERITED_PACKAGES = 1

        # Two settled shipments, one quote they have not acted on, and one
        # cancelled — which belongs in neither total.
        Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-PAID-1",
            status=Package.Status.DELIVERED,
            value_eur="100.00",
        )
        Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-PAID-2",
            status=Package.Status.IN_TRANSIT,
            value_eur="50.50",
        )
        Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-OWED-1",
            status=Package.Status.QUOTED,
            value_eur="25.25",
        )
        Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-CANC-1",
            status=Package.Status.CANCELLED,
            value_eur="999.00",
        )

    def rows(self, **params):
        return self.client.get(reverse("staff-customer-list"), params).json()["results"]

    def find(self, username, **params):
        return next(r for r in self.rows(**params) if r["username"] == username)

    def test_the_row_adds_up_what_is_paid_and_what_is_not(self):
        row = self.find("klant@example.com")

        self.assertEqual(row["paid_eur"], "150.50")
        # 25.25, not 25.25 plus something for the inherited quote that has no
        # price on it: an unpriced shipment adds nothing rather than breaking
        # the sum.
        self.assertEqual(row["outstanding_eur"], "25.25")

    def test_a_cancelled_shipment_counts_in_neither_total(self):
        """It is not owed and it was not earned. Counting it either way would
        misstate the books by 999 euro."""
        row = self.find("klant@example.com")

        self.assertNotIn("999", row["paid_eur"])
        self.assertNotIn("999", row["outstanding_eur"])
        # It is still one of their shipments.
        self.assertEqual(row["package_count"], 4 + self.INHERITED_PACKAGES)

    def test_a_customer_with_no_shipments_reads_zero_not_null(self):
        """The browser formats these as money. A null would render as an empty
        cell, which reads as "unknown" rather than as "nothing"."""
        alone = User.objects.create_user(
            username="niks@example.com",
            email="niks@example.com",
            password="a-long-enough-password",
            first_name="Geen",
            last_name="Zending",
            phone_number="+599 9 000 0000",
        )

        row = self.find(alone.username)

        self.assertEqual(row["paid_eur"], "0.00")
        self.assertEqual(row["outstanding_eur"], "0.00")

    def test_searching_by_name_finds_them_with_the_totals_intact(self):
        """The regression this is really here for.

        Searching joins the address table, so a customer with more than one
        address comes back as more than one row. A Sum annotated over the
        packages join would be multiplied by that, and this customer would
        appear to have paid 301 euro instead of 150.50. The totals are
        subqueries precisely so the join cannot reach them.
        """
        for label in ("Thuis", "Werk"):
            Address.objects.create(
                user=self.customer,
                label=label,
                street="Kaya Grandi",
                house_number="24",
                postal_code="0000",
                city="Willemstad",
                country=Address.Country.CURACAO,
            )

        found = self.rows(search="Klant")

        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["paid_eur"], "150.50")
        self.assertEqual(found[0]["outstanding_eur"], "25.25")
        self.assertEqual(found[0]["package_count"], 4 + self.INHERITED_PACKAGES)

    def test_the_totals_cannot_be_written_from_the_browser(self):
        """They are a reading of the shipment rows, not a field staff set."""
        response = self.client.patch(
            reverse("staff-customer-detail", args=[self.customer.pk]),
            {"paid_eur": "999999.00", "outstanding_eur": "0.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["paid_eur"], "150.50")


class CustomerEditTests(StaffApiTestCase):
    """Editing a customer from the dashboard.

    The point of these is that the dashboard and the customer's own profile
    page are two views of one row. So each write is checked twice: once in the
    response the table swaps in, and once from the other side - either the
    database, or the profile endpoint the customer themselves reads.
    """

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
        self.url = reverse("staff-customer-detail", args=[self.customer.pk])
        self.address_url = reverse("staff-customer-address", args=[self.customer.pk])
        self.client.force_authenticate(self.staff)

    def rows(self, **params):
        return self.client.get(reverse("staff-customer-list"), params).json()["results"]

    def customer_profile(self):
        """What the customer sees on their own profile page."""
        # force_authenticate holds this instance by reference and the profile
        # endpoint serializes request.user, so a stale copy here would read
        # back the values the test just changed.
        self.customer.refresh_from_db()
        self.client.force_authenticate(self.customer)
        data = self.client.get(reverse("profile")).json()
        self.client.force_authenticate(self.staff)
        return data

    def test_a_correction_here_is_what_the_customer_reads_on_their_profile(self):
        response = self.client.patch(
            self.url,
            {"first_name": "Voorbeeldje", "phone_number": "+599 9 000 1111"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The whole row comes back, so the table can swap it in without a
        # refetch - including the parts only the list queryset knows.
        self.assertEqual(response.json()["name"], "Voorbeeldje Klant")
        self.assertEqual(response.json()["package_count"], 1)

        profile = self.customer_profile()
        self.assertEqual(profile["first_name"], "Voorbeeldje")
        self.assertEqual(profile["phone_number"], "+599 9 000 1111")

    def test_a_customers_own_edit_is_what_the_dashboard_then_shows(self):
        """The same link, read the other way round."""
        self.client.force_authenticate(self.customer)
        self.client.patch(reverse("profile"), {"last_name": "Klantje"}, format="json")

        self.client.force_authenticate(self.staff)
        row = next(r for r in self.rows() if r["username"] == "klant@example.com")
        self.assertEqual(row["name"], "Voorbeeld Klantje")

    def test_an_e_mail_is_lowercased_and_has_to_stay_unique(self):
        self.client.patch(self.url, {"email": "Klant@Example.COM"}, format="json")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.email, "klant@example.com")

        # The column is unique, and the lowercasing above is what makes the
        # check compare like with like.
        response = self.client.patch(
            self.url, {"email": "Agent@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.email, "klant@example.com")

    def test_contact_details_cannot_be_cleared(self):
        """A customer with no e-mail and no phone cannot be told their package
        arrived, which is the one thing the record exists for."""
        for field in ["email", "phone_number"]:
            with self.subTest(field=field):
                response = self.client.patch(self.url, {field: ""}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_username_and_the_role_are_not_writable_here(self):
        self.client.patch(
            self.url,
            {"username": "someone-else", "is_staff": True, "is_superuser": True},
            format="json",
        )

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.username, "klant@example.com")
        # The role has its own action, which is where its refusals live.
        self.assertFalse(self.customer.is_staff)
        self.assertFalse(self.customer.is_superuser)

    def test_an_erased_account_is_refused(self):
        self.customer.anonymise()

        response = self.client.patch(self.url, {"first_name": "Terug"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, "")

    def test_an_address_can_be_corrected(self):
        response = self.client.post(
            self.address_url,
            {"id": self.address.pk, "house_number": "26"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.address.refresh_from_db()
        self.assertEqual(self.address.house_number, "26")
        # Corrected in place rather than added alongside.
        self.assertEqual(self.customer.addresses.count(), 1)
        self.assertEqual(self.customer_profile()["addresses"][0]["house_number"], "26")

    def test_an_address_can_be_added_when_there_is_none(self):
        self.address.delete()

        response = self.client.post(
            self.address_url,
            {
                "street": "Kaya Grandi",
                "house_number": "24",
                "postal_code": "0000",
                "city": "Kralendijk",
                "country": Address.Country.BONAIRE,
                "is_default": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["addresses"][0]["city"], "Kralendijk")
        self.assertEqual(self.customer.addresses.count(), 1)

    def test_an_address_belonging_to_someone_else_is_out_of_reach(self):
        """The id is looked up within this customer's own rows.

        Otherwise the URL would name one customer and the body could name
        another customer's address, and the body would win.
        """
        theirs = Address.objects.create(
            user=self.staff,
            street="Schottegatweg",
            house_number="1",
            city="Willemstad",
        )

        response = self.client.post(
            self.address_url, {"id": theirs.pk, "city": "Oranjestad"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        theirs.refresh_from_db()
        self.assertEqual(theirs.city, "Willemstad")

    def test_a_customer_cannot_edit_another_customer(self):
        """The whole viewset is behind IsStaff; this is the write half of it."""
        self.client.force_authenticate(self.customer)

        for response in [
            self.client.patch(self.url, {"first_name": "Changed"}, format="json"),
            self.client.post(self.address_url, {"city": "Changed"}, format="json"),
        ]:
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, "Voorbeeld")


class RoleTests(StaffApiTestCase):
    """Switching an account between admin and customer.

    The write is one boolean, so what is worth proving is the fence around it:
    who it refuses, and that a refusal leaves the flag where it was.
    """

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.staff)

    def url(self, user):
        return reverse("staff-customer-role", args=[user.pk])

    def test_a_customer_can_be_made_an_admin(self):
        response = self.client.post(
            self.url(self.customer), {"role": "admin"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["is_staff"])
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_staff)

    def test_an_admin_can_be_put_back_to_customer(self):
        other = User.objects.create_user(
            username="tweede@example.com",
            email="tweede@example.com",
            password="a-long-enough-password",
            phone_number="+599 9 111 2222",
            is_staff=True,
        )

        response = self.client.post(self.url(other), {"role": "customer"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        other.refresh_from_db()
        self.assertFalse(other.is_staff)

    def test_the_answer_carries_the_whole_row(self):
        """The table swaps the row in rather than refetching the page, so the
        response has to look like a row from the list."""
        row = self.client.post(
            self.url(self.customer), {"role": "admin"}, format="json"
        ).json()

        self.assertEqual(row["package_count"], 1)
        self.assertEqual(row["username"], "klant@example.com")
        self.assertIn("addresses", row)

    def test_you_cannot_change_your_own_role(self):
        response = self.client.post(self.url(self.staff), {"role": "customer"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.is_staff)

    def test_a_superuser_is_left_alone(self):
        root = User.objects.create_superuser(
            username="root@example.com",
            email="root@example.com",
            password="a-long-enough-password",
            phone_number="+599 9 333 4444",
        )

        response = self.client.post(self.url(root), {"role": "customer"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        root.refresh_from_db()
        self.assertTrue(root.is_staff)

    def test_an_erased_account_cannot_be_promoted(self):
        self.customer.anonymise()

        response = self.client.post(
            self.url(self.customer), {"role": "admin"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_staff)

    def test_an_unknown_role_is_refused(self):
        response = self.client.post(
            self.url(self.customer), {"role": "superuser"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_staff)

    def test_a_customer_cannot_promote_themselves(self):
        """The whole point of the fence: the flag that opens the dashboard is
        not reachable by anyone who is not already through it."""
        self.client.force_authenticate(self.customer)

        response = self.client.post(
            self.url(self.customer), {"role": "admin"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_staff)

    def test_the_row_says_whether_its_role_can_be_changed(self):
        rows = self.client.get(reverse("staff-customer-list")).json()["results"]
        by_username = {row["username"]: row for row in rows}

        self.assertTrue(by_username["klant@example.com"]["can_change_role"])
        # The caller's own row.
        self.assertFalse(by_username["agent@example.com"]["can_change_role"])
