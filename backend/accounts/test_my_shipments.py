"""Tests for the journey details on a customer's own shipment list.

The profile page's "My shipments" opens each shipment to show where it is
and when it should arrive. What matters: the same reading as Track & Trace,
and still only the customer's own shipments.
"""

from datetime import date

from django.urls import reverse
from rest_framework import status

from .models import Address, Package
from .public import PUBLIC_STAGES
from .test_api import ApiTestCase, make_user


class MyShipmentJourneyTests(ApiTestCase):
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
        self.client.force_authenticate(self.user)

    def make(self, number, status_value, **extra):
        return Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number=number,
            status=status_value,
            **extra,
        )

    def rows(self):
        response = self.client.get(reverse("package-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["results"] if "results" in response.data else response.data
        return {row["tracking_number"]: row for row in data}

    def test_each_shipment_says_where_it_is_and_when_it_arrives(self):
        self.make(
            "PLSM-1",
            Package.Status.IN_TRANSIT,
            estimated_arrival=date(2026, 10, 15),
        )

        row = self.rows()["PLSM-1"]

        self.assertEqual(row["destination"], "Curaçao")
        self.assertEqual(row["progress"], 60)
        self.assertEqual(row["estimated_arrival"], "2026-10-15")
        stages = [stage["value"] for stage in row["stages"]]
        self.assertEqual(stages, [value for value, _ in PUBLIC_STAGES])
        self.assertEqual(stages[row["stage_index"]], "in_transit")

    def test_a_quote_and_a_cancelled_shipment_are_not_on_the_journey(self):
        self.make("PLSM-Q", Package.Status.QUOTED)
        self.make("PLSM-C", Package.Status.CANCELLED)

        rows = self.rows()

        self.assertEqual(rows["PLSM-Q"]["stage_index"], -1)
        self.assertEqual(rows["PLSM-C"]["stage_index"], -1)

    def test_still_only_the_customers_own_shipments(self):
        self.make("PLSM-MINE", Package.Status.PAID)
        stranger = make_user(username="other", email="someone-else@example.com")
        Package.objects.create(
            user=stranger, tracking_number="PLSM-THEIRS", status=Package.Status.PAID
        )

        self.assertEqual(set(self.rows()), {"PLSM-MINE"})
