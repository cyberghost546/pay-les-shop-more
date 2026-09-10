"""Fetching the file a visitor attached to a quote request.

The dashboard used to link straight at the file's own MEDIA_URL. That works
while DEBUG is on, because django.conf.urls.static serves MEDIA_ROOT for the
runserver, and answers 404 on a deployed site, because nothing serves it there.
Publishing MEDIA_ROOT would have fixed the 404 and opened every attachment to
anyone who could guess a name — the same trade the invoice routes already
refused.

So the file is streamed by a route behind IsStaff, and these tests are the
three things that has to be true of it: staff get the bytes, nobody else gets
anything, and a row pointing at a file that is not there is a 404 rather than
a 500.
"""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from enquiries.models import QuoteRequest

User = get_user_model()


class QuoteAttachmentTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.staff = User.objects.create_user(
            username="agent@example.com",
            email="agent@example.com",
            password="a-long-enough-password",
            phone_number="+599 9 123 4567",
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            username="john@example.com",
            email="john@example.com",
            password="a-long-enough-password",
            phone_number="+599 9 765 4321",
        )

        self.quote = QuoteRequest.objects.create(
            destination="curacao",
            first_name="John",
            last_name="Smith",
            email="john@example.com",
            message="How much for a television?",
            file=SimpleUploadedFile(
                "receipt.pdf", b"%PDF-1.4\nreceipt\n", content_type="application/pdf"
            ),
        )

    def url(self, quote=None):
        return reverse("staff-quote-file", kwargs={"pk": (quote or self.quote).pk})

    def test_staff_can_fetch_the_attachment(self):
        self.client.force_authenticate(self.staff)

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4\nreceipt\n")

    def test_it_is_handed_over_as_a_download_and_not_rendered(self):
        """A file from a stranger is never something to render in a tab."""
        self.client.force_authenticate(self.staff)

        response = self.client.get(self.url())

        self.assertIn("attachment", response["Content-Disposition"])
        self.assertEqual(response["Content-Type"], "application/octet-stream")

    def test_a_customer_is_refused(self):
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_a_stranger_is_refused(self):
        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_a_quote_with_no_attachment_is_a_404(self):
        bare = QuoteRequest.objects.create(
            destination="curacao",
            first_name="Mary",
            last_name="Jones",
            email="mary@example.com",
            message="No receipt to hand.",
        )
        self.client.force_authenticate(self.staff)

        self.assertEqual(
            self.client.get(self.url(bare)).status_code, status.HTTP_404_NOT_FOUND
        )

    def test_the_row_points_at_the_route_and_not_at_the_storage_path(self):
        self.client.force_authenticate(self.staff)

        row = self.client.get(
            reverse("staff-quote-detail", kwargs={"pk": self.quote.pk})
        ).data

        self.assertEqual(row["file_url"], self.url())
        self.assertNotIn("/media/", row["file_url"])
