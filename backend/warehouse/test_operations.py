"""Roles, and the warehouse's package operations: measure, pack, damage, activity."""

import shutil
import tempfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Package, PackageEvent

from .models import (
    ImmutableRecord,
    PackageActivity,
    PackageDamagePhoto,
    PackageDamageReport,
    PackageMeasurement,
)

User = get_user_model()

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def make_user(email, **extra):
    return User.objects.create_user(
        username=email, email=email, password="a-long-enough-password", **extra
    )


class RoleModelTests(TestCase):
    def test_each_role_sets_its_flags(self):
        for role, staff, warehouse in (
            ("admin", True, False),
            ("office", True, False),
            ("warehouse", False, True),
            ("driver", False, False),
            ("customer", False, False),
        ):
            with self.subTest(role=role):
                user = make_user(f"{role}@example.com", role=role)
                self.assertEqual((user.is_staff, user.is_warehouse), (staff, warehouse))

    def test_flags_set_the_old_way_become_a_role(self):
        self.assertEqual(make_user("a@example.com", is_staff=True).role, "admin")
        self.assertEqual(make_user("w@example.com", is_warehouse=True).role, "warehouse")

    def test_changing_the_role_moves_both_flags(self):
        user = make_user("x@example.com", role="warehouse")
        user.role = User.Role.OFFICE
        user.save(update_fields=["role"])
        user.refresh_from_db()
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_warehouse)

    def test_an_office_worker_stays_office_when_a_flag_moves(self):
        user = make_user("o@example.com", role="office")
        user.is_warehouse = True
        user.save()
        user.refresh_from_db()
        self.assertEqual(user.role, "office")

    def test_only_admins_are_admins(self):
        self.assertTrue(make_user("a@example.com", role="admin").is_admin)
        self.assertFalse(make_user("o@example.com", role="office").is_admin)


class RoleApiTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin@example.com", role="admin")
        self.office = make_user("office@example.com", role="office")
        self.floor = make_user("floor@example.com", role="warehouse")
        self.driver = make_user("driver@example.com", role="driver")
        self.customer = make_user("klant@example.com", phone_number="+599 9 123 4567")

    def test_an_office_worker_cannot_change_roles(self):
        self.client.force_authenticate(self.office)
        response = self.client.post(
            reverse("staff-customer-role", args=[self.customer.pk]), {"role": "admin"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, "customer")

    def test_an_admin_can_make_a_driver(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse("staff-customer-role", args=[self.customer.pk]), {"role": "driver"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "driver")

    def test_an_office_worker_cannot_open_a_staff_account(self):
        self.client.force_authenticate(self.office)
        response = self.client.post(
            reverse("staff-customer-list"),
            {
                "first_name": "N",
                "last_name": "N",
                "email": "new@example.com",
                "phone_number": "+599 9 000 0000",
                "role": "warehouse",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_a_warehouse_worker_is_kept_out_of_the_office(self):
        self.client.force_authenticate(self.floor)
        for name in ("staff-package-list", "staff-customer-list", "staff-invoice-list", "staff-overview"):
            with self.subTest(route=name):
                self.assertEqual(
                    self.client.get(reverse(name)).status_code, status.HTTP_403_FORBIDDEN
                )

    def test_a_driver_has_no_warehouse_access(self):
        self.client.force_authenticate(self.driver)
        for name in (
            "staff-warehouse-shipment-board",
            "staff-warehouse-activity-list",
            "staff-warehouse-measurement-list",
            "staff-warehouse-damage-list",
        ):
            with self.subTest(route=name):
                self.assertEqual(
                    self.client.get(reverse(name)).status_code, status.HTTP_403_FORBIDDEN
                )

    def test_the_profile_carries_the_role(self):
        self.client.force_authenticate(self.floor)
        self.assertEqual(self.client.get(reverse("profile")).data["role"], "warehouse")


class OperationsTestCase(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.customer = make_user("klant@example.com", first_name="Klaas", last_name="Klant")
        self.floor = make_user("vloer@example.com", role="warehouse", first_name="Wim")
        self.office = make_user("kantoor@example.com", role="office")
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLS-2001",
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.RECEIVED,
        )
        self.client.force_authenticate(self.floor)

    def url(self, name, *args):
        return reverse(f"staff-warehouse-shipment-{name}", args=args)

    def measure(self, **overrides):
        body = {"weight_kg": "12.5", "length_cm": "60", "width_cm": "40", "height_cm": "30"}
        body.update(overrides)
        return self.client.post(self.url("measurements", self.package.pk), body, format="json")

    def actions(self):
        return list(
            PackageActivity.objects.filter(package=self.package)
            .order_by("timestamp", "id")
            .values_list("action", flat=True)
        )


class MeasurementTests(OperationsTestCase):
    def test_a_measurement_is_saved_under_the_signed_in_worker(self):
        response = self.measure(worker=self.office.pk)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        measurement = PackageMeasurement.objects.get()
        self.assertEqual(measurement.worker, self.floor)
        self.assertEqual(measurement.volume_m3, Decimal("0.0720"))
        # 60 × 40 × 30 / 6000
        self.assertEqual(measurement.dimensional_weight_kg, Decimal("12.00"))
        self.assertEqual(response.data["measurement"]["worker"]["id"], self.floor.pk)
        self.assertIsNotNone(response.data["measurement"]["date"])
        self.assertEqual(response.data["shipment"]["warehouse_stage"], "measured")
        self.assertEqual(self.actions(), ["measurement_completed", "package_status_changed"])

    def test_remeasuring_keeps_the_history(self):
        self.measure()
        self.measure(weight_kg="13")

        first, second = PackageMeasurement.objects.order_by("measured_at", "id")
        self.assertEqual(second.supersedes, first)
        self.assertIn("measurement_updated", self.actions())

    def test_bad_values_are_refused_and_nothing_is_written(self):
        for field, value in (
            ("weight_kg", "0"),
            ("weight_kg", "-3"),
            ("weight_kg", "99999"),
            ("length_cm", "abc"),
            ("width_cm", ""),
            ("height_cm", "NaN"),
            ("weight_kg", "1.234"),
        ):
            with self.subTest(field=field, value=value):
                response = self.measure(**{field: value})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
        self.assertFalse(PackageMeasurement.objects.exists())
        self.assertFalse(PackageActivity.objects.exists())

    def test_the_office_sees_the_measurement_straight_away(self):
        self.measure()
        self.client.force_authenticate(self.office)

        row = self.client.get(reverse("staff-package-detail", args=[self.package.pk])).data
        self.assertEqual(row["measurement"]["weight_kg"], "12.50")
        self.assertEqual(row["workflow_status"], "measured")

    def test_a_shipment_that_has_left_cannot_be_measured(self):
        Package.objects.filter(pk=self.package.pk).update(status=Package.Status.IN_TRANSIT)
        self.assertEqual(self.measure().status_code, status.HTTP_409_CONFLICT)

    def test_a_customer_cannot_measure(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.measure().status_code, status.HTTP_403_FORBIDDEN)


class PackagingTests(OperationsTestCase):
    def pack(self, **body):
        return self.client.post(self.url("packaging", self.package.pk), body, format="json")

    def test_bubble_wrap_is_recorded(self):
        self.measure()
        response = self.pack(packaging_type="bubble_wrap", quantity=2, notes="Fragile")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["packaging"]["worker"]["id"], self.floor.pk)
        self.assertEqual(response.data["shipment"]["warehouse_stage"], "awaiting_packaging")
        self.assertIn("bubble_wrap_added", self.actions())

    def test_other_needs_notes_and_quantity_must_be_sane(self):
        self.assertEqual(self.pack(packaging_type="other").status_code, 400)
        self.assertEqual(self.pack(packaging_type="tape", quantity=0).status_code, 400)
        self.assertEqual(self.pack(packaging_type="tape", quantity="x").status_code, 400)
        self.assertEqual(self.pack(packaging_type="glue").status_code, 400)


class DamageTests(OperationsTestCase):
    def report(self, photos=(), **body):
        data = {"damage_type": "box_damaged", "description": "Corner crushed", **body}
        if photos:
            data["photos"] = list(photos)
        return self.client.post(self.url("damage", self.package.pk), data, format="multipart")

    def test_a_report_with_a_photo(self):
        response = self.report(photos=[SimpleUploadedFile("x.png", PNG, content_type="image/png")])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        report = PackageDamageReport.objects.get()
        self.assertEqual(report.worker, self.floor)
        self.assertEqual(report.resolution_status, "open")
        photo = PackageDamagePhoto.objects.get()
        self.assertEqual(photo.content_type, "image/png")
        self.assertEqual(self.actions(), ["damage_reported"])

        served = self.client.get(response.data["damage_report"]["photos"][0]["url"].replace("/staff", "/api/staff", 1))
        self.assertEqual(served.status_code, status.HTTP_200_OK)
        self.assertEqual(served["Content-Type"], "image/png")

    def test_a_file_that_is_not_an_image_is_refused(self):
        fake = SimpleUploadedFile("x.jpg", b"<html>not a photo</html>", content_type="image/jpeg")
        response = self.report(photos=[fake])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PackageDamageReport.objects.exists())

    def test_resolving_happens_once(self):
        report_id = self.report().data["damage_report"]["id"]
        url = reverse("staff-warehouse-damage-resolve", args=[report_id])

        first = self.client.post(url, {"note": "Repacked"}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["resolved_by"]["id"], self.floor.pk)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 409)
        self.assertEqual(self.actions(), ["damage_reported", "damage_resolved"])

    def test_the_open_list_and_the_board_count_it(self):
        self.report()
        rows = self.client.get(reverse("staff-warehouse-damage-list"), {"status": "open"}).data
        self.assertEqual(rows["count"], 1)
        board = self.client.get(self.url("board")).data
        self.assertEqual(board["damaged"], 1)
        self.assertEqual(board["attention"], 1)


class StageRuleTests(OperationsTestCase):
    def move(self, stage):
        return self.client.post(self.url("stage", self.package.pk), {"stage": stage}, format="json")

    def test_a_worker_cannot_set_office_or_dispatch_stages(self):
        for stage in ("awaiting_pickup", "shipped"):
            with self.subTest(stage=stage):
                self.assertEqual(self.move(stage).status_code, status.HTTP_403_FORBIDDEN)

    def test_the_detail_says_which_stages_are_allowed(self):
        stages = self.client.get(self.url("detail", self.package.pk)).data["allowed_stages"]
        self.assertNotIn("shipped", stages)
        self.assertIn("packed", stages)

    def test_ready_needs_a_measurement_and_no_open_damage(self):
        self.assertEqual(self.move("ready").status_code, status.HTTP_409_CONFLICT)
        self.measure()
        PackageDamageReport.objects.create(
            package=self.package, worker=self.floor, damage_type="wet_package"
        )
        self.assertEqual(self.move("ready").status_code, status.HTTP_409_CONFLICT)
        PackageDamageReport.objects.get().resolve(self.floor)

        response = self.move("ready")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["workflow_status"], "ready_for_shipping")
        self.assertEqual(self.actions()[-1], "package_marked_ready")

    def test_the_whole_floor_workflow(self):
        self.client.post(self.url("scanned", self.package.pk), {"code": "PLS-2001"}, format="json")
        self.measure()
        self.client.post(
            self.url("packaging", self.package.pk), {"packaging_type": "box"}, format="json"
        )
        self.move("packed")
        self.move("ready")

        self.assertEqual(
            self.actions(),
            [
                "package_scanned",
                "measurement_completed",
                "package_status_changed",
                "packaging_added",
                "package_status_changed",
                "package_packed",
                "package_marked_ready",
            ],
        )


class ActivityTests(OperationsTestCase):
    def test_activity_rows_cannot_be_changed_or_deleted(self):
        self.measure()
        row = PackageActivity.objects.first()

        row.description = "rewritten"
        with self.assertRaises(ImmutableRecord):
            row.save()
        with self.assertRaises(ImmutableRecord):
            row.delete()
        with self.assertRaises(ImmutableRecord):
            PackageActivity.objects.all().update(description="x")
        with self.assertRaises(ImmutableRecord):
            PackageActivity.objects.all().delete()
        with self.assertRaises(ImmutableRecord):
            PackageMeasurement.objects.first().save()

    def test_the_timeline_merges_office_status_changes_in_order(self):
        self.measure()
        PackageEvent.objects.create(
            package=self.package,
            kind=PackageEvent.Kind.STATUS_CHANGED,
            actor=self.office,
            context={"from_status": "paid", "to_status": "purchased"},
        )

        timeline = self.client.get(self.url("activity", self.package.pk)).data
        self.assertEqual(
            [entry["action"] for entry in timeline],
            ["measurement_completed", "package_status_changed", "shipment_status_changed"],
        )
        self.assertEqual(timeline[0]["user"]["name"], "Wim")
        self.assertEqual(timeline[2]["description"], "Paid → Products purchased")

    def test_mine_and_package_filters(self):
        self.measure()
        url = reverse("staff-warehouse-activity-list")
        self.assertEqual(self.client.get(url, {"mine": "true"}).data["count"], 2)
        self.client.force_authenticate(self.office)
        self.assertEqual(self.client.get(url, {"mine": "true"}).data["count"], 0)
        self.assertEqual(self.client.get(url, {"package": self.package.pk}).data["count"], 2)
        self.assertEqual(self.client.get(url, {"package": "1 OR 1=1"}).status_code, 400)

    def test_package_ids_are_validated(self):
        self.assertEqual(self.client.get("/api/staff/warehouse/shipments/abc/").status_code, 404)
        self.assertEqual(self.client.get(self.url("detail", 999999)).status_code, 404)

    def test_location_is_set_and_logged(self):
        response = self.client.post(
            self.url("location", self.package.pk), {"location": "b-04"}, format="json"
        )
        self.assertEqual(response.data["warehouse_location"], "B-04")
        self.assertEqual(self.actions(), ["location_changed"])

    def test_a_worker_with_history_is_anonymised_rather_than_deleted(self):
        self.measure()
        self.client.force_authenticate(self.floor)
        response = self.client.post(
            reverse("account-delete"), {"current_password": "a-long-enough-password"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["anonymised"])
        self.assertEqual(PackageMeasurement.objects.get().worker_id, self.floor.pk)
