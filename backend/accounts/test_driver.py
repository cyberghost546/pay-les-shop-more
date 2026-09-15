"""The driver's deliveries API."""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from notifications.models import Notification

from .models import DeliveryConfirmation, Package, PackageEvent

User = get_user_model()

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def make_user(email, **extra):
    return User.objects.create_user(username=email, email=email, password="a-long-enough-password", **extra)


class DriverTests(APITestCase):
    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)

        self.customer = make_user("klant@example.com", first_name="Klaas", phone_number="+599 9 123 4567")
        self.driver = make_user("chauffeur@example.com", role="driver", first_name="Dirk")
        self.floor = make_user("vloer@example.com", role="warehouse")
        self.arrived = Package.objects.create(
            user=self.customer, tracking_number="PLS-3001", status=Package.Status.ARRIVED
        )
        self.in_transit = Package.objects.create(
            user=self.customer, tracking_number="PLS-3002", status=Package.Status.IN_TRANSIT
        )
        self.client.force_authenticate(self.driver)

    def deliver(self, package=None, **data):
        body = {"recipient_name": "Klaas Klant", **data}
        return self.client.post(
            reverse("driver-delivery-deliver", args=[(package or self.arrived).pk]), body, format="multipart"
        )

    def test_a_driver_sees_only_what_is_waiting_for_delivery(self):
        rows = self.client.get(reverse("driver-delivery-list")).data["results"]
        self.assertEqual([row["tracking_number"] for row in rows], ["PLS-3001"])
        self.assertEqual(rows[0]["customer_phone"], "+599 9 123 4567")

    def test_customers_and_the_warehouse_are_kept_out(self):
        for user in (self.customer, self.floor):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                self.assertEqual(
                    self.client.get(reverse("driver-delivery-list")).status_code, status.HTTP_403_FORBIDDEN
                )

    def test_delivering_records_everything_and_tells_the_customer(self):
        photo = SimpleUploadedFile("proof.jpg", JPEG, content_type="image/jpeg")
        response = self.deliver(note="Left with neighbour", photo=photo)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.arrived.refresh_from_db()
        self.assertEqual(self.arrived.status, Package.Status.DELIVERED)
        self.assertIsNotNone(self.arrived.delivered_at)

        confirmation = DeliveryConfirmation.objects.get()
        self.assertEqual(confirmation.driver, self.driver)
        self.assertEqual(confirmation.recipient_name, "Klaas Klant")
        self.assertEqual(confirmation.photo_content_type, "image/jpeg")

        event = self.arrived.events.get(kind=PackageEvent.Kind.STATUS_CHANGED)
        self.assertEqual(event.actor, self.driver)
        self.assertTrue(Notification.objects.filter(package=self.arrived).exists())

        today = self.client.get(reverse("driver-delivery-list"), {"view": "today"}).data["results"]
        self.assertEqual(today[0]["delivered"]["recipient_name"], "Klaas Klant")
        self.assertEqual(
            self.client.get(reverse("driver-delivery-photo", args=[self.arrived.pk])).status_code, 200
        )

    def test_a_name_is_required_and_the_photo_must_be_an_image(self):
        self.assertEqual(self.deliver(recipient_name="").status_code, status.HTTP_400_BAD_REQUEST)
        fake = SimpleUploadedFile("proof.jpg", b"<html>", content_type="image/jpeg")
        self.assertEqual(self.deliver(photo=fake).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(DeliveryConfirmation.objects.exists())

    def test_only_an_arrived_shipment_can_be_delivered_and_only_once(self):
        self.assertEqual(self.deliver(self.in_transit).status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.deliver().status_code, status.HTTP_200_OK)
        self.assertEqual(self.deliver().status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(DeliveryConfirmation.objects.count(), 1)
