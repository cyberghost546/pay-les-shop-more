"""Tests for the two public forms.

These endpoints take input from anyone, so the limits are the subject.
"""

import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ContactMessage, QuoteRequest

# Uploads in tests go to a temporary directory, never the real media folder.
MEDIA_ROOT = tempfile.mkdtemp()


class ContactMessageTests(APITestCase):
    url = reverse("contact")

    def test_anyone_can_send_a_message(self):
        response = self.client.post(
            self.url,
            {
                "name": "Jan Doe",
                "email": "jan@example.com",
                "subject": "Algemene vraag",
                "message": "Ik heb een vraag over verzenden naar Curacao.",
                "language": "nl",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ContactMessage.objects.count(), 1)

        saved = ContactMessage.objects.get()
        self.assertEqual(saved.email, "jan@example.com")
        self.assertFalse(saved.handled)

    def test_response_does_not_echo_the_submission(self):
        """Write-only: nothing read out, so a bug cannot leak submissions."""
        response = self.client.post(
            self.url,
            {
                "name": "Jan Doe",
                "email": "jan@example.com",
                "subject": "Algemene vraag",
                "message": "Ik heb een vraag over verzenden.",
            },
            format="json",
        )
        self.assertIsNone(response.data)

    def test_invalid_email_is_refused(self):
        response = self.client.post(
            self.url,
            {
                "name": "Jan Doe",
                "email": "not-an-email",
                "subject": "Algemene vraag",
                "message": "Ik heb een vraag over verzenden.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContactMessage.objects.count(), 0)

    def test_short_message_is_refused(self):
        response = self.client.post(
            self.url,
            {
                "name": "Jan Doe",
                "email": "jan@example.com",
                "subject": "Algemene vraag",
                "message": "kort",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_enormous_message_is_refused(self):
        """No upper bound would make the form a way to fill the disk."""
        response = self.client.post(
            self.url,
            {
                "name": "Jan Doe",
                "email": "jan@example.com",
                "subject": "Algemene vraag",
                "message": "x" * 6000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_messages_cannot_be_read_back(self):
        ContactMessage.objects.create(
            name="Jan", email="jan@example.com", subject="x", message="y"
        )
        self.assertEqual(
            self.client.get(self.url).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class QuoteRequestTests(APITestCase):
    url = reverse("quote")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def payload(self, **overrides):
        data = {
            "destination": "Curaçao",
            "first_name": "Jan",
            "last_name": "Doe",
            "email": "jan@example.com",
            "message": "Graag een offerte voor deze producten.",
        }
        data.update(overrides)
        return data

    def test_quote_without_a_file_is_accepted(self):
        """The copy tells people they may describe the list instead."""
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(QuoteRequest.objects.count(), 1)
        self.assertFalse(QuoteRequest.objects.get().file)

    def test_quote_with_a_pdf_is_accepted(self):
        upload = SimpleUploadedFile(
            "boodschappen.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        response = self.client.post(
            self.url, self.payload(file=upload), format="multipart"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        saved = QuoteRequest.objects.get()
        self.assertTrue(saved.file)
        self.assertIn("boodschappen", saved.file.name)

    def test_executable_upload_is_refused(self):
        upload = SimpleUploadedFile(
            "payload.exe", b"MZ fake", content_type="application/octet-stream"
        )
        response = self.client.post(
            self.url, self.payload(file=upload), format="multipart"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(QuoteRequest.objects.count(), 0)

    def test_upload_with_a_lying_content_type_is_still_refused(self):
        """The browser supplies content_type, so it cannot be trusted alone —
        the extension is checked too."""
        upload = SimpleUploadedFile(
            "payload.exe", b"MZ fake", content_type="application/pdf"
        )
        response = self.client.post(
            self.url, self.payload(file=upload), format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_upload_is_refused(self):
        upload = SimpleUploadedFile(
            "groot.pdf", b"x" * (11 * 1024 * 1024), content_type="application/pdf"
        )
        response = self.client.post(
            self.url, self.payload(file=upload), format="multipart"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(QuoteRequest.objects.count(), 0)

    def test_missing_name_is_refused(self):
        response = self.client.post(
            self.url, self.payload(first_name=""), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quotes_cannot_be_read_back(self):
        self.assertEqual(
            self.client.get(self.url).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
