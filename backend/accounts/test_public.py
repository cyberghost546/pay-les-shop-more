"""Tests for the public tracking and statistics endpoints.

What carries the weight: that an anonymous caller learns where a shipment is
and nothing about who is receiving it.
"""

from datetime import date

from django.urls import reverse
from rest_framework import status

from enquiries.models import QuoteRequest

from .models import Address, Package
from .test_api import ApiTestCase, make_user


class TrackingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.address = Address.objects.create(
            user=self.user,
            street="Kaya Grandi",
            house_number="24",
            postal_code="0000",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )
        self.package = Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-1234",
            description="Two boxes of clothing",
            status=Package.Status.IN_TRANSIT,
            estimated_arrival=date(2026, 10, 1),
        )

    def url(self, number="PLSM-1234"):
        return reverse("track", args=[number])

    def test_anyone_can_look_up_a_shipment(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "PLSM-1234")
        self.assertEqual(response.data["status"], "in_transit")
        self.assertEqual(response.data["destination"], "Curaçao")
        self.assertEqual(response.data["progress"], 60)

    def test_it_reveals_nothing_about_the_recipient(self):
        """The whole reason this endpoint is written by hand rather than
        reusing PackageSerializer."""
        body = self.client.get(self.url()).content.decode()

        for secret in [
            "Jan",
            "Doe",
            "jan@example.com",
            "+599 9 123 4567",
            "Kaya Grandi",
            "Willemstad",
            "0000",
            # Not private as such, but nobody else's business either.
            "Two boxes of clothing",
        ]:
            with self.subTest(secret=secret):
                self.assertNotIn(secret, body)

        returned = set(self.client.get(self.url()).data)
        for field in ["user", "delivery_address", "delivery_address_text", "id"]:
            with self.subTest(field=field):
                self.assertNotIn(field, returned)

    def test_an_unknown_number_is_a_404(self):
        response = self.client.get(self.url("PLSM-DOES-NOT-EXIST"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_number_is_matched_case_insensitively_and_trimmed(self):
        """It is typed in by hand off a label or out of an e-mail."""
        self.assertEqual(
            self.client.get(self.url("plsm-1234")).status_code, status.HTTP_200_OK
        )
        self.assertEqual(
            self.client.get(self.url("  PLSM-1234  ")).status_code, status.HTTP_200_OK
        )

    def test_the_timeline_marks_where_the_shipment_is(self):
        data = self.client.get(self.url()).data

        self.assertEqual([stage["value"] for stage in data["stages"]][2], "in_transit")
        self.assertEqual(data["stage_index"], 2)

    def test_a_quoted_shipment_is_not_yet_on_the_timeline(self):
        self.package.status = Package.Status.QUOTED
        self.package.save()

        self.assertEqual(self.client.get(self.url()).data["stage_index"], -1)

    def test_a_cancelled_shipment_shows_no_progress(self):
        self.package.status = Package.Status.CANCELLED
        self.package.save()

        data = self.client.get(self.url()).data
        self.assertEqual(data["progress"], 0)
        self.assertEqual(data["stage_index"], -1)

    def test_the_destination_survives_the_customer_being_erased(self):
        """anonymise() deletes the address rows; the frozen text is what is
        left, and its last line is the country."""
        self.user.anonymise()
        self.package.refresh_from_db()

        data = self.client.get(self.url()).data
        self.assertEqual(data["destination"], "Curaçao")
        self.assertNotIn("Kaya Grandi", self.client.get(self.url()).content.decode())

    def test_the_arrival_date_is_shown_when_known(self):
        self.assertEqual(
            self.client.get(self.url()).data["estimated_arrival"], "2026-10-01"
        )

    def test_the_arrival_date_is_null_rather_than_guessed(self):
        """No date is better than one arithmetic invented."""
        self.package.estimated_arrival = None
        self.package.save()

        self.assertIsNone(self.client.get(self.url()).data["estimated_arrival"])


class SiteStatsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.address = Address.objects.create(
            user=self.user,
            street="Kaya Grandi",
            house_number="24",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )

    def make_package(self, number, status_value, address=None):
        return Package.objects.create(
            user=self.user,
            delivery_address=address or self.address,
            tracking_number=number,
            status=status_value,
        )

    def test_counts_are_real(self):
        self.make_package("A1", Package.Status.DELIVERED)
        self.make_package("A2", Package.Status.DELIVERED)
        self.make_package("A3", Package.Status.IN_TRANSIT)

        data = self.client.get(reverse("site-stats")).data

        self.assertEqual(data["packages_delivered"], 2)
        self.assertEqual(data["packages_in_transit"], 1)
        self.assertEqual(data["packages_total"], 3)
        self.assertEqual(data["customers"], 1)

    def test_destinations_counts_islands_actually_shipped_to(self):
        """Not the length of the list of countries we would serve."""
        aruba = Address.objects.create(
            user=self.user,
            street="Caya Betico Croes",
            house_number="45",
            city="Oranjestad",
            country=Address.Country.ARUBA,
        )
        self.make_package("B1", Package.Status.DELIVERED)
        self.make_package("B2", Package.Status.DELIVERED)
        self.make_package("B3", Package.Status.DELIVERED, address=aruba)

        self.assertEqual(self.client.get(reverse("site-stats")).data["destinations"], 2)

    def test_anonymised_customers_are_not_counted(self):
        before = self.client.get(reverse("site-stats")).data["customers"]
        self.user.anonymise()
        after = self.client.get(reverse("site-stats")).data["customers"]

        self.assertEqual(after, before - 1)

    def test_quotes_handled_counts_only_answered_ones(self):
        for destination, state in [
            ("Curaçao", QuoteRequest.Status.NEW),
            ("Aruba", QuoteRequest.Status.QUOTED),
            ("Bonaire", QuoteRequest.Status.ACCEPTED),
        ]:
            QuoteRequest.objects.create(
                destination=destination,
                first_name="A",
                last_name="B",
                email="a@example.com",
                status=state,
            )

        self.assertEqual(
            self.client.get(reverse("site-stats")).data["quotes_handled"], 2
        )

    def test_it_works_on_an_empty_database(self):
        """The homepage renders on day one, before anything has shipped."""
        Package.objects.all().delete()
        data = self.client.get(reverse("site-stats")).data

        self.assertEqual(data["packages_delivered"], 0)
        self.assertEqual(data["destinations"], 0)
