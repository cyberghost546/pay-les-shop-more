"""Tests for the booking form.

The boundary that matters: the customer fills in their half and cannot reach
the office's. Everything else here is about the form refusing bookings nobody
could act on.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from config.testing import ThrottleFreeAPITestCase

from .models import Booking

User = get_user_model()

URL = reverse("booking-create")


def payload(**overrides):
    """A complete, valid booking. Tests override the one field under test."""
    data = {
        "freight": "sea",
        "destination": "CW",
        "sender_first_name": "Voorbeeld",
        "sender_last_name": "Klant",
        "sender_address": "Hertzstraat 10",
        "sender_postal_code": "2652 XX",
        "sender_city": "Berkel en Rodenrijs",
        "sender_phone": "+31 10 767 0371",
        "sender_email": "afzender@example.com",
        "recipient_first_name": "Maria",
        "recipient_last_name": "Martina",
        "recipient_address": "Kaya Grandi 24",
        "recipient_city": "Willemstad",
        "recipient_phone": "+599 9 512 4433",
        "packing": "sender",
        "payment": "bank",
        "quantity": 3,
        "unit": "boxes",
        "contents": "Kleding en boeken",
        "value_eur": "450.00",
        "vehicle": "na",
        "signature_name": "Voorbeeld Klant",
        "agreed_terms": True,
    }
    data.update(overrides)
    return data


class BookingSubmissionTests(ThrottleFreeAPITestCase):
    def test_a_complete_booking_is_accepted(self):
        response = self.client.post(URL, payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Booking.objects.count(), 1)

        booking = Booking.objects.get()
        self.assertEqual(booking.sender_name, "Voorbeeld Klant")
        self.assertEqual(booking.recipient_name, "Maria Martina")
        self.assertEqual(booking.destination_label, "Curaçao")
        self.assertEqual(booking.status, Booking.Status.NEW)

    def test_only_the_reference_is_echoed_back(self):
        response = self.client.post(URL, payload(), format="json")
        self.assertEqual(set(response.data), {"id", "created_at"})

    def test_the_office_half_starts_empty(self):
        self.client.post(URL, payload(), format="json")
        booking = Booking.objects.get()

        self.assertEqual(booking.shipping_number, "")
        self.assertIsNone(booking.volume_m3)
        self.assertIsNone(booking.weight_kg)
        self.assertEqual(booking.packing_quality, "")

    def test_the_office_half_cannot_be_set_by_the_sender(self):
        """The reason the two serializers are separate."""
        response = self.client.post(
            URL,
            payload(
                shipping_number="CI-0001",
                status="shipped",
                volume_m3="9.9",
                weight_kg="500",
                packing_quality="good",
                office_notes="let me through",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get()
        self.assertEqual(booking.shipping_number, "")
        self.assertEqual(booking.status, Booking.Status.NEW)
        self.assertIsNone(booking.volume_m3)
        self.assertIsNone(booking.weight_kg)
        self.assertEqual(booking.packing_quality, "")
        self.assertEqual(booking.office_notes, "")

    def test_the_terms_have_to_be_accepted(self):
        response = self.client.post(URL, payload(agreed_terms=False), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("agreed_terms", response.data)
        self.assertEqual(Booking.objects.count(), 0)

    def test_a_signature_needs_a_name(self):
        response = self.client.post(URL, payload(signature_name="  "), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_signing_time_is_stamped_by_the_server(self):
        """Not sent by the browser: when a signature was given is not
        something the signer chooses."""
        self.client.post(URL, payload(), format="json")
        self.assertIsNotNone(Booking.objects.get().signed_at)

    def test_a_signed_in_customer_is_attached_to_their_booking(self):
        user = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
            first_name="Voorbeeld",
            last_name="Klant",
            phone_number="+599 9 123 4567",
        )
        self.client.force_authenticate(user)

        self.client.post(URL, payload(), format="json")
        self.assertEqual(Booking.objects.get().user, user)

    def test_booking_without_an_account_is_allowed(self):
        self.client.post(URL, payload(), format="json")
        self.assertIsNone(Booking.objects.get().user)


class BookingValidationTests(ThrottleFreeAPITestCase):
    def test_other_destination_needs_saying_which(self):
        response = self.client.post(URL, payload(destination="other"), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("destination_other", response.data)

    def test_other_destination_with_a_name_is_accepted(self):
        response = self.client.post(
            URL, payload(destination="other", destination_other="Saba"), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Booking.objects.get().destination_label, "Saba")

    def test_a_named_destination_clears_any_stray_free_text(self):
        self.client.post(
            URL, payload(destination="AW", destination_other="Saba"), format="json"
        )
        self.assertEqual(Booking.objects.get().destination_other, "")

    def test_insurance_needs_a_value(self):
        response = self.client.post(URL, payload(insured=True), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insured_value_eur", response.data)

    def test_an_uninsured_booking_carries_no_insured_value(self):
        """A half-filled form must not leave a figure behind that suggests
        cover nobody paid for."""
        self.client.post(
            URL, payload(insured=False, insured_value_eur="900.00"), format="json"
        )
        self.assertIsNone(Booking.objects.get().insured_value_eur)

    def test_the_emigration_boxes_are_cleared_without_an_emigration(self):
        self.client.post(
            URL,
            payload(
                emigration=False,
                id_present=True,
                deregistered=True,
                deregistration_present=True,
            ),
            format="json",
        )

        booking = Booking.objects.get()
        self.assertFalse(booking.id_present)
        self.assertFalse(booking.deregistered)
        self.assertFalse(booking.deregistration_present)

    def test_the_emigration_boxes_are_kept_with_one(self):
        self.client.post(
            URL, payload(emigration=True, id_present=True), format="json"
        )

        booking = Booking.objects.get()
        self.assertTrue(booking.emigration)
        self.assertTrue(booking.id_present)

    def test_contents_or_an_attached_list_is_required(self):
        response = self.client.post(
            URL, payload(contents="", contents_attached=False), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contents", response.data)

    def test_an_attached_list_stands_in_for_a_description(self):
        response = self.client.post(
            URL, payload(contents="", contents_attached=True), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_a_negative_value_is_refused(self):
        response = self.client.post(URL, payload(value_eur="-1.00"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nothing_to_ship_is_refused(self):
        response = self.client.post(URL, payload(quantity=0), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_implausible_phone_number_is_refused(self):
        response = self.client.post(URL, payload(sender_phone="nonsense"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_recipients_email_is_optional(self):
        """The agent phones rather than writes; an island address is enough."""
        response = self.client.post(URL, payload(recipient_email=""), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
