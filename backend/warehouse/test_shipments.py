"""The warehouse's shipment API: scan, stages, problems and the board."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Package, PackageEvent

from .models import IntakeSheet, Measurement

User = get_user_model()


class ShipmentTestCase(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
            first_name="Klaas",
            last_name="Klant",
        )
        self.floor = User.objects.create_user(
            username="vloer@example.com",
            email="vloer@example.com",
            password="a-long-enough-password",
            is_warehouse=True,
        )
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLS-1001",
            description="Television",
            status=Package.Status.PAID,
            weight_kg="12.5",
        )
        self.client.force_authenticate(self.floor)

    def url(self, name, *args):
        return reverse(f"staff-warehouse-shipment-{name}", args=args)


class AccessTests(ShipmentTestCase):
    def test_a_customer_cannot_reach_it(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(self.url("board"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_warehouse_account_can(self):
        response = self.client.get(self.url("detail", self.package.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class LookupTests(ShipmentTestCase):
    def test_finds_by_tracking_number_in_any_case(self):
        response = self.client.get(self.url("lookup"), {"code": "pls-1001"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "PLS-1001")
        self.assertEqual(response.data["customer"], "Klaas Klant")
        self.assertIsNone(response.data["invoice"])

    def test_finds_through_an_intake_sheet_reference(self):
        sheet = IntakeSheet.objects.create(
            reference="CI-9", package=self.package, freight=IntakeSheet.Freight.AIR
        )
        Measurement.objects.create(
            sheet=sheet, quantity=2, length_cm=50, width_cm=40, height_cm=30, weight_kg=6
        )

        response = self.client.get(self.url("lookup"), {"code": "CI-9"})

        self.assertEqual(response.data["id"], self.package.pk)
        self.assertEqual(response.data["intake"]["freight"], "air")
        self.assertEqual(response.data["intake"]["colli"], 2)
        self.assertEqual(response.data["intake"]["weight_kg"], "12.00")

    def test_unknown_code_is_404(self):
        response = self.client.get(self.url("lookup"), {"code": "nope"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_intake_scan_carries_the_shipment(self):
        response = self.client.get(reverse("staff-intake-scan"), {"code": "PLS-1001"})
        self.assertEqual(response.data["shipment"]["id"], self.package.pk)


class StageTests(ShipmentTestCase):
    def test_moving_stamps_the_time_received_and_the_history(self):
        response = self.client.post(
            self.url("stage", self.package.pk), {"stage": "received"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["warehouse_stage"], "received")

        self.package.refresh_from_db()
        self.assertIsNotNone(self.package.received_at)
        event = self.package.events.get()
        self.assertEqual(event.kind, PackageEvent.Kind.WAREHOUSE_STAGE_CHANGED)
        self.assertEqual(event.context, {"from_stage": "awaiting_pickup", "to_stage": "received"})
        self.assertEqual(event.actor, self.floor)

    def test_it_does_not_touch_the_customer_status(self):
        self.client.post(self.url("stage", self.package.pk), {"stage": "packed"}, format="json")
        self.package.refresh_from_db()
        self.assertEqual(self.package.status, Package.Status.PAID)

    def test_a_stage_can_be_moved_back(self):
        self.client.post(self.url("stage", self.package.pk), {"stage": "packed"}, format="json")
        response = self.client.post(
            self.url("stage", self.package.pk), {"stage": "awaiting_measurement"}, format="json"
        )
        self.assertEqual(response.data["warehouse_stage"], "awaiting_measurement")

    def test_the_office_can_still_move_a_locked_shipment(self):
        office = User.objects.create_user(
            username="kantoor@example.com",
            email="kantoor@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.client.force_authenticate(office)
        self.package.status = Package.Status.IN_TRANSIT
        self.package.save()
        response = self.client.post(
            self.url("stage", self.package.pk), {"stage": "shipped"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_nonsense_is_refused(self):
        response = self.client.post(
            self.url("stage", self.package.pk), {"stage": "teleported"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class FollowStatusTests(ShipmentTestCase):
    """The office's status change moves the warehouse stage when goods leave."""

    def setUp(self):
        super().setUp()
        self.office = User.objects.create_user(
            username="kantoor@example.com",
            email="kantoor@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.client.force_authenticate(self.office)
        self.package.warehouse_stage = Package.WarehouseStage.PACKED
        self.package.save()

    def patch_status(self, value):
        return self.client.patch(
            reverse("staff-package-detail", args=[self.package.pk]),
            {"status": value},
            format="json",
        )

    def test_in_transit_marks_it_shipped(self):
        response = self.patch_status("in_transit")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.package.refresh_from_db()
        self.assertEqual(self.package.warehouse_stage, "shipped")
        event = self.package.events.get(kind=PackageEvent.Kind.WAREHOUSE_STAGE_CHANGED)
        self.assertEqual(event.context["to_stage"], "shipped")
        self.assertEqual(event.actor, self.office)

    def test_an_earlier_status_leaves_the_stage_alone(self):
        self.patch_status("purchased")
        self.package.refresh_from_db()
        self.assertEqual(self.package.warehouse_stage, "packed")


class FreightTests(ShipmentTestCase):
    def test_an_intake_sheet_fills_in_a_blank_freight(self):
        response = self.client.post(
            reverse("staff-intake-list"),
            {"package": self.package.pk, "freight": "air"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.package.refresh_from_db()
        self.assertEqual(self.package.freight, "air")

    def test_it_does_not_overrule_the_office(self):
        self.package.freight = Package.Freight.SEA
        self.package.save()
        sheet = IntakeSheet.objects.create(package=self.package)

        self.client.patch(
            reverse("staff-intake-detail", args=[sheet.pk]), {"freight": "air"}, format="json"
        )

        self.package.refresh_from_db()
        self.assertEqual(self.package.freight, "sea")

    def test_the_scan_card_shows_it(self):
        self.package.freight = Package.Freight.AIR
        self.package.save()
        response = self.client.get(self.url("detail", self.package.pk))
        self.assertEqual(response.data["freight_display"], "Air freight")


class ProblemTests(ShipmentTestCase):
    def test_report_and_resolve(self):
        response = self.client.post(
            self.url("problem", self.package.pk), {"note": "Box crushed"}, format="json"
        )
        self.assertTrue(response.data["has_problem"])
        self.assertEqual(response.data["problem_note"], "Box crushed")

        response = self.client.post(self.url("resolve", self.package.pk))
        self.assertFalse(response.data["has_problem"])

        kinds = list(self.package.events.values_list("kind", flat=True))
        self.assertEqual(kinds, ["problem_reported", "problem_resolved"])

    def test_a_problem_needs_words(self):
        response = self.client.post(
            self.url("problem", self.package.pk), {"note": "  "}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BoardTests(ShipmentTestCase):
    def test_counts_stages_today_problems_and_overdue(self):
        now = timezone.now()
        Package.objects.create(
            user=self.customer,
            tracking_number="PLS-1002",
            status=Package.Status.PURCHASED,
            warehouse_stage=Package.WarehouseStage.PACKED,
            warehouse_stage_at=now - timedelta(days=4),
            received_at=now,
            weight_kg="7.5",
            problem_note="Label missing",
        )
        # Neither of these is the warehouse's work.
        Package.objects.create(user=self.customer, tracking_number="PLS-1003")
        Package.objects.create(
            user=self.customer,
            tracking_number="PLS-1004",
            status=Package.Status.DELIVERED,
            warehouse_stage=Package.WarehouseStage.SHIPPED,
            warehouse_stage_at=now - timedelta(days=30),
        )

        response = self.client.get(self.url("board"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        stages = {row["stage"]: row for row in response.data["stages"]}
        self.assertEqual(stages["awaiting_pickup"]["count"], 1)
        self.assertEqual(stages["packed"]["count"], 1)
        self.assertEqual(stages["packed"]["overdue"], 1)
        self.assertEqual(stages["shipped"]["count"], 0)
        self.assertEqual(response.data["problems"], 1)
        self.assertEqual(response.data["overdue"], 1)
        self.assertEqual(response.data["today"], {"packages": 1, "weight_kg": "7.50"})

    def test_the_list_filters(self):
        self.package.warehouse_stage_at = timezone.now() - timedelta(days=10)
        self.package.save()

        overdue = self.client.get(self.url("list"), {"overdue": "true"})
        self.assertEqual([row["id"] for row in overdue.data["results"]], [self.package.pk])

        packed = self.client.get(self.url("list"), {"stage": "packed"})
        self.assertEqual(packed.data["results"], [])
