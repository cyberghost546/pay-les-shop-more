"""Tests for the shipment lock: what a shipment stops allowing once it goes.

What carries the weight here is that the rule is not the dashboard's. A
disabled button is a courtesy; the tests below send the requests the disabled
button would have sent, straight at the API, as the customer and as a member
of staff, and expect the same refusal both times. The model tests underneath
go one layer lower still, because a serializer guards one door and save()
guards all of them.
"""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from config.testing import ThrottleFreeAPITestCase

from .models import (
    Address,
    InvalidShipmentTransition,
    Package,
    PackageDocument,
    ShipmentLocked,
)

User = get_user_model()

A_PDF = b"%PDF-1.4\n% a small but genuine-looking pdf\n"


def make_customer(username="klant@example.com"):
    return User.objects.create_user(
        username=username,
        email=username,
        password="a-long-enough-password",
        first_name="Voorbeeld",
        last_name="Klant",
        phone_number="+599 9 123 4567",
    )


def make_staff():
    return User.objects.create_user(
        username="agent@example.com",
        email="agent@example.com",
        password="a-long-enough-password",
        first_name="Back",
        last_name="Office",
        phone_number="+599 9 765 4321",
        is_staff=True,
    )


class LockTierTests(APITestCase):
    """Which stages are open, which are the office's, and which are closed."""

    def setUp(self):
        self.customer = make_customer()
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Een televisie",
        )

    def at(self, shipment_status):
        """The same shipment, seen at another stage, without moving it there.

        force_update rather than save(): these tests are about what each stage
        allows, not about the routes between them, and several of the stages
        cannot legally be reached from several of the others.
        """
        Package.objects.filter(pk=self.package.pk).force_update(status=shipment_status)
        return Package.objects.get(pk=self.package.pk)

    def test_a_customer_may_add_to_a_shipment_that_has_not_been_packed(self):
        for stage in [
            Package.Status.QUOTED,
            Package.Status.PAID,
            Package.Status.PURCHASED,
        ]:
            with self.subTest(stage=stage):
                package = self.at(stage)
                self.assertTrue(package.can_change())
                self.assertFalse(package.locked)
                self.assertFalse(package.locked_for_customer)
                self.assertEqual(package.lock_reason, "")

    def test_ready_for_shipping_is_closed_to_the_customer_and_open_to_staff(self):
        package = self.at(Package.Status.READY_FOR_SHIPPING)

        self.assertFalse(package.can_change())
        self.assertTrue(package.can_change(by_staff=True))
        self.assertTrue(package.locked_for_customer)
        self.assertFalse(package.locked)
        self.assertIn("packed", package.lock_reason)

    def test_a_shipment_that_has_left_is_closed_to_everybody(self):
        for stage in [
            Package.Status.IN_TRANSIT,
            Package.Status.ARRIVED,
            Package.Status.DELIVERED,
            Package.Status.CANCELLED,
        ]:
            with self.subTest(stage=stage):
                package = self.at(stage)
                self.assertTrue(package.locked)
                self.assertFalse(package.can_change())
                self.assertFalse(package.can_change(by_staff=True))
                self.assertNotEqual(package.lock_reason, "")

    def test_the_reason_tells_the_customer_where_the_next_purchase_goes(self):
        package = self.at(Package.Status.IN_TRANSIT)
        self.assertIn("separate shipment", package.lock_reason)

    def test_a_cancelled_shipment_says_so_rather_than_talking_about_shipping(self):
        package = self.at(Package.Status.CANCELLED)
        self.assertIn("cancelled", package.lock_reason)


class SaveEnforcementTests(APITestCase):
    """The rule where every write path has to pass through it."""

    def setUp(self):
        self.customer = make_customer()
        self.address = Address.objects.create(
            user=self.customer,
            street="Kaya Grandi",
            house_number="24",
            postal_code="0000",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )
        self.package = Package.objects.create(
            user=self.customer,
            delivery_address=self.address,
            tracking_number="PLSM-0001",
            description="Een televisie",
            value_eur="899.00",
            status=Package.Status.IN_TRANSIT,
        )

    def reloaded(self):
        return Package.objects.get(pk=self.package.pk)

    def test_the_contents_of_a_shipment_that_has_left_cannot_be_changed(self):
        package = self.reloaded()
        package.description = "Een televisie en een koelkast"

        with self.assertRaises(ShipmentLocked):
            package.save()

        self.assertEqual(self.reloaded().description, "Een televisie")

    def test_its_declared_value_cannot_be_changed(self):
        package = self.reloaded()
        package.value_eur = "1.00"

        with self.assertRaises(ShipmentLocked):
            package.save()

    def test_its_destination_cannot_be_changed(self):
        other = Address.objects.create(
            user=self.customer,
            street="Front Street",
            house_number="1",
            city="Philipsburg",
            country=Address.Country.SINT_MAARTEN,
        )
        package = self.reloaded()
        package.delivery_address = other

        with self.assertRaises(ShipmentLocked):
            package.save()

    def test_it_cannot_be_moved_to_another_customer(self):
        package = self.reloaded()
        package.user = make_customer("ander@example.com")

        with self.assertRaises(ShipmentLocked):
            package.save()

    def test_the_dates_and_the_arrival_estimate_still_move(self):
        """Locked is not frozen. Staff still record what happens to it."""
        package = self.reloaded()
        package.estimated_arrival = "2026-11-01"
        package.save()

        self.assertIsNotNone(self.reloaded().estimated_arrival)

    def test_a_locked_shipment_still_finishes_its_journey(self):
        package = self.reloaded()
        package.status = Package.Status.ARRIVED
        package.save()

        package.status = Package.Status.DELIVERED
        package.save()

        self.assertEqual(self.reloaded().status, Package.Status.DELIVERED)

    def test_a_shipment_cannot_travel_backwards(self):
        package = self.reloaded()
        package.status = Package.Status.PAID

        with self.assertRaises(InvalidShipmentTransition):
            package.save()

    def test_a_shipment_that_has_left_cannot_be_cancelled(self):
        package = self.reloaded()
        package.status = Package.Status.CANCELLED

        with self.assertRaises(InvalidShipmentTransition):
            package.save()

    def test_a_delivered_shipment_is_locked_permanently(self):
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.DELIVERED
        )
        package = self.reloaded()

        for stage in [Package.Status.ARRIVED, Package.Status.CANCELLED]:
            with self.subTest(stage=stage):
                package.status = stage
                with self.assertRaises(InvalidShipmentTransition):
                    package.save()

        package.status = Package.Status.DELIVERED
        package.description = "Iets anders"
        with self.assertRaises(ShipmentLocked):
            package.save()

    def test_creating_a_shipment_that_is_already_delivered_is_allowed(self):
        """An import is not a modification. Refusing it would protect nothing
        and break every fixture and backfill."""
        package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-OLD-1",
            status=Package.Status.DELIVERED,
        )
        self.assertEqual(package.status, Package.Status.DELIVERED)

    def test_a_bulk_update_cannot_step_around_the_lock(self):
        """The bypass that save() alone would leave open."""
        with self.assertRaises(ShipmentLocked):
            Package.objects.filter(pk=self.package.pk).update(
                status=Package.Status.PAID
            )

        with self.assertRaises(ShipmentLocked):
            Package.objects.filter(pk=self.package.pk).update(description="Iets anders")

        self.assertEqual(self.reloaded().status, Package.Status.IN_TRANSIT)

    def test_a_bulk_update_of_an_unprotected_column_still_works(self):
        Package.objects.filter(pk=self.package.pk).update(
            estimated_arrival="2026-11-01"
        )
        self.assertIsNotNone(self.reloaded().estimated_arrival)

    def test_force_unlock_is_the_deliberate_way_through(self):
        package = self.reloaded()
        package.description = "Gecorrigeerd"
        package.save(force_unlock=True)

        self.assertEqual(self.reloaded().description, "Gecorrigeerd")


class StaffApiLockTests(ThrottleFreeAPITestCase):
    """The office meets the same rule, over HTTP, with a status code."""

    def setUp(self):
        super().setUp()
        self.customer = make_customer()
        self.staff = make_staff()
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Een televisie",
        )
        self.client.force_authenticate(self.staff)

    def url(self):
        return reverse("staff-package-detail", args=[self.package.pk])

    def ship(self):
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.IN_TRANSIT
        )

    def test_the_contents_of_a_sent_shipment_are_refused(self):
        self.ship()

        response = self.client.patch(self.url(), {"description": "En een koelkast"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.package.refresh_from_db()
        self.assertEqual(self.package.description, "Een televisie")

    def test_the_declared_value_of_a_sent_shipment_is_refused(self):
        self.ship()

        response = self.client.patch(self.url(), {"value_eur": "1.00"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_backwards_status_move_is_refused(self):
        self.ship()

        response = self.client.patch(self.url(), {"status": "paid"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.package.refresh_from_db()
        self.assertEqual(self.package.status, Package.Status.IN_TRANSIT)

    def test_a_sent_shipment_cannot_be_cancelled(self):
        self.ship()

        response = self.client.patch(self.url(), {"status": "cancelled"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_sent_shipment_still_arrives_and_is_delivered(self):
        self.ship()

        self.assertEqual(
            self.client.patch(self.url(), {"status": "arrived"}).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(self.url(), {"status": "delivered"}).status_code,
            status.HTTP_200_OK,
        )

    def test_a_shipment_can_still_be_cancelled_before_it_leaves(self):
        response = self.client.patch(self.url(), {"status": "cancelled"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_ready_for_shipping_is_a_stage_the_office_can_set(self):
        self.client.patch(self.url(), {"status": "paid"})
        self.client.patch(self.url(), {"status": "purchased"})

        response = self.client.patch(self.url(), {"status": "ready_for_shipping"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.package.refresh_from_db()
        self.assertEqual(self.package.status, Package.Status.READY_FOR_SHIPPING)

    def test_the_row_says_whether_it_is_locked(self):
        self.ship()

        row = self.client.get(self.url()).data

        self.assertTrue(row["locked"])
        self.assertTrue(row["locked_for_customer"])
        self.assertNotEqual(row["lock_reason"], "")


class CustomerApiLockTests(ThrottleFreeAPITestCase):
    """What the customer's own API says about a shipment that has gone."""

    def setUp(self):
        super().setUp()
        self.customer = make_customer()
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Een televisie",
            status=Package.Status.IN_TRANSIT,
        )
        self.client.force_authenticate(self.customer)

    def test_a_shipment_carries_its_own_lock_state(self):
        row = self.client.get(reverse("package-list")).data["results"][0]

        self.assertTrue(row["locked"])
        self.assertIn("separate shipment", row["lock_reason"])

    def test_there_is_no_write_endpoint_to_find(self):
        """The shape of the API is itself part of the enforcement."""
        url = reverse("package-detail", args=[self.package.pk])

        for method in [self.client.patch, self.client.put, self.client.delete]:
            with self.subTest(method=method.__name__):
                response = method(url, {"status": "paid"})
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )


class SeparateShipmentTests(APITestCase):
    """The other half of the rule: what happens to the next purchase.

    A customer who buys something else after their shipment has gone does not
    get it folded into the shipment that went. The receipt is still kept - it
    arrives unfiled, which is a state the system already had for a receipt
    that turns up before its parcel does - and it becomes the paperwork for a
    new shipment with its own tracking number.
    """

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.customer = make_customer()
        self.staff = make_staff()
        self.shipped = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-1001",
            description="Een televisie",
            status=Package.Status.IN_TRANSIT,
        )
        self.client.force_authenticate(self.customer)

    def upload(self, package):
        return self.client.post(
            reverse("package-document-list"),
            {
                "package": package.pk,
                "file": SimpleUploadedFile("kassabon.pdf", A_PDF, "application/pdf"),
                "kind": PackageDocument.Kind.RECEIPT,
            },
            format="multipart",
        )

    def test_a_receipt_is_kept_but_not_filed_against_a_shipment_that_left(self):
        response = self.upload(self.shipped)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["filed_separately"])
        self.assertIsNone(response.data["tracking_number"])
        self.assertEqual(PackageDocument.objects.count(), 1)
        self.assertIsNone(PackageDocument.objects.get().package_id)

    def test_the_customer_is_told_why_and_what_happens_next(self):
        detail = self.upload(self.shipped).data["detail"]

        self.assertIn("separate shipment", detail)

    def test_the_shipment_that_left_is_untouched(self):
        self.upload(self.shipped)

        self.shipped.refresh_from_db()
        self.assertEqual(self.shipped.status, Package.Status.IN_TRANSIT)
        self.assertEqual(self.shipped.documents.count(), 0)

    def test_a_shipment_still_open_takes_the_receipt_normally(self):
        open_shipment = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-1002",
            description="Een koelkast",
            status=Package.Status.PAID,
        )

        response = self.upload(open_shipment)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("filed_separately", response.data)
        self.assertEqual(open_shipment.documents.count(), 1)

    def test_a_shipment_packed_and_waiting_is_closed_to_the_customer(self):
        Package.objects.filter(pk=self.shipped.pk).force_update(
            status=Package.Status.READY_FOR_SHIPPING
        )

        self.assertTrue(self.upload(self.shipped).data["filed_separately"])

    def test_but_the_office_can_still_add_to_one_that_is_only_packed(self):
        Package.objects.filter(pk=self.shipped.pk).force_update(
            status=Package.Status.READY_FOR_SHIPPING
        )
        self.client.force_authenticate(self.staff)

        response = self.upload(self.shipped)

        self.assertNotIn("filed_separately", response.data)
        self.assertEqual(self.shipped.documents.count(), 1)

    def test_not_even_the_office_can_add_to_one_that_has_left(self):
        self.client.force_authenticate(self.staff)

        self.assertTrue(self.upload(self.shipped).data["filed_separately"])

    def test_a_new_shipment_gets_its_own_id_and_its_own_status(self):
        """Order #1002 next to order #1001, in this system's terms."""
        second = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-1002",
            description="Een koelkast",
        )

        self.assertNotEqual(second.pk, self.shipped.pk)
        self.assertNotEqual(second.tracking_number, self.shipped.tracking_number)
        self.assertEqual(second.status, Package.Status.QUOTED)
        self.assertFalse(second.locked)

        self.shipped.refresh_from_db()
        self.assertEqual(self.shipped.status, Package.Status.IN_TRANSIT)

    def test_the_history_keeps_the_two_shipments_apart(self):
        Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-1002",
            description="Een koelkast",
        )

        rows = self.client.get(reverse("package-list")).data["results"]

        self.assertEqual(len(rows), 2)
        self.assertEqual(
            {row["tracking_number"] for row in rows}, {"PLSM-1001", "PLSM-1002"}
        )


class DocumentRemovalTests(APITestCase):
    """Taking paperwork back off a shipment."""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.customer = make_customer()
        self.staff = make_staff()
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Een televisie",
        )
        self.document = PackageDocument.objects.create(
            customer=self.customer,
            package=self.package,
            uploaded_by=self.customer,
            kind=PackageDocument.Kind.RECEIPT,
            file=SimpleUploadedFile("kassabon.pdf", A_PDF, "application/pdf"),
        )

    def url(self):
        return reverse("package-document-detail", args=[self.document.pk])

    def ship(self):
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.IN_TRANSIT
        )

    def test_a_customer_can_withdraw_a_receipt_before_the_shipment_goes(self):
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.client.delete(self.url()).status_code, status.HTTP_204_NO_CONTENT
        )

    def test_a_customer_cannot_withdraw_one_after_it_has_gone(self):
        self.ship()
        self.client.force_authenticate(self.customer)

        response = self.client.delete(self.url())

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(PackageDocument.objects.filter(pk=self.document.pk).exists())

    def test_staff_can_still_clear_up_a_misfiled_receipt(self):
        self.ship()
        self.client.force_authenticate(self.staff)

        self.assertEqual(
            self.client.delete(self.url()).status_code, status.HTTP_204_NO_CONTENT
        )

    def test_staff_cannot_file_a_document_onto_a_shipment_that_has_left(self):
        other = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0002",
            status=Package.Status.DELIVERED,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            reverse("package-document-attach", args=[self.document.pk]),
            {"package": other.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.document.refresh_from_db()
        self.assertEqual(self.document.package_id, self.package.pk)

    def test_staff_can_still_unfile_one(self):
        self.ship()
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            reverse("package-document-attach", args=[self.document.pk]),
            {"package": ""},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.document.refresh_from_db()
        self.assertIsNone(self.document.package_id)
