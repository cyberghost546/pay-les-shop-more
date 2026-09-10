"""Tests for raising an invoice by hand from the dashboard.

The subject is the pairing. An invoice carries a customer's name, their
shipment's declared value and where it went, and it is published to a profile
page — so an invoice on the wrong shipment is a disclosure, not a typo. The
tests below send the request the form would send with the ids swapped, which
is exactly what a stale dropdown or a hand-edited request does, and expect it
refused against the stored rows rather than against anything the request said
about itself.

The rest is the promise that this does not disturb what already worked: the
automatic invoice a paid shipment raises, and the render that follows an
approval.
"""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Package

from .models import Invoice

User = get_user_model()

A_PDF = b"%PDF-1.4\n% small, but genuinely a pdf\n"


def make_user(username, **extra):
    return User.objects.create_user(
        username=username,
        email=username,
        password="a-long-enough-password",
        phone_number="+599 9 123 4567",
        **extra,
    )


class ManualInvoiceTestCase(APITestCase):
    """Two customers with a shipment each, and one member of staff."""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.staff = make_user("agent@example.com", is_staff=True, first_name="Back",
                               last_name="Office")
        self.john = make_user("john@example.com", first_name="John", last_name="Smith")
        self.mary = make_user("mary@example.com", first_name="Mary", last_name="Jones")

        self.johns = Package.objects.create(
            user=self.john,
            tracking_number="PLSM-1001",
            description="Een televisie",
            value_eur="899.00",
        )
        self.marys = Package.objects.create(
            user=self.mary,
            tracking_number="PLSM-2001",
            description="Een koelkast",
            value_eur="450.00",
        )

        self.client.force_authenticate(self.staff)

    def url(self):
        return reverse("staff-invoice-list")

    def a_pdf(self, name="invoice.pdf", body=A_PDF, content_type="application/pdf"):
        return SimpleUploadedFile(name, body, content_type=content_type)

    def create(self, **overrides):
        payload = {
            "customer": self.john.pk,
            "package": self.johns.pk,
            "pdf": self.a_pdf(),
            "status": Invoice.Status.SENT,
        }
        payload.update(overrides)
        # None means "leave this out", which is how the optional fields are
        # tested rather than sent empty.
        payload = {k: v for k, v in payload.items() if v is not None}
        return self.client.post(self.url(), payload, format="multipart")


class OwnershipTests(ManualInvoiceTestCase):
    """The rule the endpoint exists for."""

    def test_an_invoice_can_be_raised_for_a_customers_own_shipment(self):
        response = self.create()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        invoice = Invoice.objects.get()
        self.assertEqual(invoice.package, self.johns)
        self.assertEqual(invoice.package.user, self.john)

    def test_a_shipment_belonging_to_someone_else_is_refused(self):
        """The disclosure this whole endpoint is guarded against."""
        response = self.create(customer=self.john.pk, package=self.marys.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("package", response.data)
        self.assertFalse(Invoice.objects.exists())

    def test_the_refusal_names_both_sides_so_the_mistake_is_findable(self):
        said = str(self.create(package=self.marys.pk).data["package"])

        self.assertIn("PLSM-2001", said)
        self.assertIn("John", said)

    def test_the_customer_id_in_the_body_is_not_believed(self):
        """Sending Mary's shipment with Mary's id does not launder it onto John.

        The check is against package.user_id, so naming the true owner is the
        only way through - and then the invoice is Mary's, which is correct.
        """
        response = self.create(customer=self.mary.pk, package=self.marys.pk)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Invoice.objects.get().package.user, self.mary)

    def test_a_shipment_that_does_not_exist_is_refused(self):
        self.assertEqual(
            self.create(package=999999).status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_a_customer_that_does_not_exist_is_refused(self):
        self.assertEqual(
            self.create(customer=999999).status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_a_customer_cannot_reach_this_endpoint_at_all(self):
        self.client.force_authenticate(self.john)

        self.assertEqual(self.create().status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Invoice.objects.exists())

    def test_nor_can_an_anonymous_caller(self):
        self.client.force_authenticate(None)

        self.assertEqual(self.create().status_code, status.HTTP_403_FORBIDDEN)


class DuplicateTests(ManualInvoiceTestCase):
    """One shipment, one invoice."""

    def test_a_second_invoice_for_one_shipment_is_refused(self):
        self.assertEqual(self.create().status_code, status.HTTP_201_CREATED)

        response = self.create()

        # 409, not 400: nothing is wrong with the form, the shipment simply
        # already has an invoice.
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already exists", str(response.data["detail"]))
        self.assertEqual(Invoice.objects.count(), 1)

    def test_the_refusal_says_which_invoice_already_exists(self):
        existing = self.create().data["id"]

        response = self.create()

        # So the dashboard can offer to open it rather than only saying no.
        self.assertEqual(int(response.data["existing_invoice"]), existing)
        self.assertEqual(str(response.data["tracking_number"]), "PLSM-1001")

    def test_an_automatically_raised_invoice_counts_as_the_existing_one(self):
        """The manual form must not produce a second copy of one the system
        already raised when the shipment was marked paid."""
        from .services import ensure_invoice_for_package

        automatic = ensure_invoice_for_package(self.johns)

        response = self.create()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(int(response.data["existing_invoice"]), automatic.pk)
        self.assertEqual(Invoice.objects.count(), 1)


class DocumentTests(ManualInvoiceTestCase):
    """The upload, checked the same way the queue's upload is."""

    def test_a_pdf_is_required(self):
        self.assertEqual(
            self.create(pdf=None).status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_a_file_that_is_not_a_pdf_is_refused(self):
        response = self.create(
            pdf=self.a_pdf("invoice.pdf", b"<html>not a pdf at all</html>")
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not a PDF", str(response.data["pdf"]))
        self.assertFalse(Invoice.objects.exists())

    def test_an_empty_file_is_refused(self):
        response = self.create(pdf=self.a_pdf("invoice.pdf", b""))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_file_over_the_limit_is_refused(self):
        too_big = A_PDF + b"x" * (10 * 1024 * 1024)
        response = self.create(pdf=self.a_pdf("invoice.pdf", too_big))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("larger than", str(response.data["pdf"]))

    def test_the_stored_name_is_ours_and_not_the_browsers(self):
        self.create(pdf=self.a_pdf("../../etc/passwd.pdf"))

        stored = Invoice.objects.get().pdf.name
        self.assertNotIn("passwd", stored)
        self.assertIn("PLSM-1001", stored)


class StatusTests(ManualInvoiceTestCase):
    """How far the invoice goes, and who is recorded as having sent it."""

    def test_sent_reaches_the_customer_immediately(self):
        self.create(status=Invoice.Status.SENT)

        invoice = Invoice.objects.get()
        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertIsNotNone(invoice.sent_at)
        self.assertTrue(invoice.pdf)
        # Approved in the uploader's name, so the audit trail still answers
        # who let this document out of the building.
        self.assertEqual(invoice.reviewed_by, self.staff)

    def test_pending_review_waits_in_the_queue_with_its_document(self):
        self.create(status=Invoice.Status.PENDING_REVIEW)

        invoice = Invoice.objects.get()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertTrue(invoice.pdf)
        self.assertIsNone(invoice.reviewed_by)

    def test_approved_keeps_the_uploaded_document(self):
        """The render task must not draw over a document a person chose."""
        self.create(status=Invoice.Status.APPROVED)

        invoice = Invoice.objects.get()
        self.assertTrue(invoice.pdf)
        with invoice.pdf.open("rb") as handle:
            self.assertEqual(handle.read(), A_PDF)

    def test_approved_is_not_sent_by_the_worker_behind_the_admins_back(self):
        """"Approve it, but do not send yet" has to mean that.

        The render task runs on commit after every approval. Before this it
        would find the invoice approved, draw a document over the uploaded one
        and mark it sent - overruling the choice from somewhere nobody can
        see. It now leaves an invoice that already carries a document alone.
        """
        from .tasks import render_approved_invoice

        self.create(status=Invoice.Status.APPROVED)
        invoice = Invoice.objects.get()

        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertIsNone(invoice.sent_at)
        with invoice.pdf.open("rb") as handle:
            self.assertEqual(handle.read(), A_PDF)

    def test_it_can_be_sent_afterwards_without_uploading_again(self):
        self.create(status=Invoice.Status.APPROVED)
        invoice = Invoice.objects.get()
        stored = invoice.pdf.name

        response = self.client.post(
            reverse("staff-invoice-send", args=[invoice.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertIsNotNone(invoice.sent_at)
        # The same document, not a second copy of it.
        self.assertEqual(invoice.pdf.name, stored)

    def test_sending_one_that_is_still_in_review_is_refused(self):
        self.create(status=Invoice.Status.PENDING_REVIEW)
        invoice = Invoice.objects.get()

        response = self.client.post(
            reverse("staff-invoice-send", args=[invoice.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_sending_one_twice_is_refused(self):
        self.create(status=Invoice.Status.SENT)
        invoice = Invoice.objects.get()

        response = self.client.post(
            reverse("staff-invoice-send", args=[invoice.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_the_automatic_render_still_draws_and_sends(self):
        """The path that was already there, untouched."""
        from .services import ensure_invoice_for_package
        from .tasks import render_approved_invoice

        invoice = ensure_invoice_for_package(self.johns)
        invoice.approve(self.staff)

        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertTrue(invoice.pdf)

    def test_draft_and_rejected_are_not_on_offer(self):
        for refused in [Invoice.Status.DRAFT, Invoice.Status.REJECTED]:
            with self.subTest(status=refused):
                response = self.create(status=refused)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_whoever_raised_it_is_recorded(self):
        self.create()

        self.assertEqual(Invoice.objects.get().created_by, self.staff)

    def test_an_automatic_invoice_has_nobody_recorded(self):
        """Null is the answer, not a gap: no person raised it."""
        from .services import ensure_invoice_for_package

        self.assertIsNone(ensure_invoice_for_package(self.johns).created_by)


class InvoiceDateTests(ManualInvoiceTestCase):
    def test_it_defaults_to_today(self):
        self.create()

        self.assertEqual(Invoice.objects.get().invoice_date, timezone.localdate())

    def test_it_can_be_backdated(self):
        self.create(invoice_date="2026-08-01")

        self.assertEqual(str(Invoice.objects.get().invoice_date), "2026-08-01")

    def test_it_cannot_be_dated_in_the_future(self):
        ahead = timezone.localdate() + timezone.timedelta(days=1)

        response = self.create(invoice_date=str(ahead))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Invoice.objects.exists())

    def test_an_automatic_invoice_falls_back_to_the_day_it_was_raised(self):
        from .services import ensure_invoice_for_package

        invoice = ensure_invoice_for_package(self.johns)

        self.assertIsNone(invoice.invoice_date)
        self.assertEqual(invoice.dated_on, timezone.localdate())


class VisibilityTests(ManualInvoiceTestCase):
    """Whose invoice a customer can see, and whose they cannot."""

    def setUp(self):
        super().setUp()
        self.create(customer=self.john.pk, package=self.johns.pk)
        self.johns_invoice = Invoice.objects.get()

    def test_it_appears_on_the_right_customers_profile(self):
        self.client.force_authenticate(self.john)

        rows = self.client.get(reverse("invoice-list")).data["results"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["tracking_number"], "PLSM-1001")

    def test_another_customer_sees_nothing(self):
        self.client.force_authenticate(self.mary)

        self.assertEqual(self.client.get(reverse("invoice-list")).data["count"], 0)

    def test_another_customer_cannot_fetch_it_by_id(self):
        self.client.force_authenticate(self.mary)
        url = reverse("invoice-detail", args=[self.johns_invoice.pk])

        self.assertEqual(
            self.client.get(url).status_code, status.HTTP_404_NOT_FOUND
        )

    def test_another_customer_cannot_download_the_document(self):
        self.client.force_authenticate(self.mary)
        url = reverse("invoice-pdf", args=[self.johns_invoice.pk])

        self.assertEqual(
            self.client.get(url).status_code, status.HTTP_404_NOT_FOUND
        )

    def test_the_owner_can_download_it(self):
        self.client.force_authenticate(self.john)
        url = reverse("invoice-pdf", args=[self.johns_invoice.pk])

        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_an_invoice_still_in_review_is_not_shown_to_anybody(self):
        """A document nobody has approved is not the customer's to read yet."""
        self.create(customer=self.mary.pk, package=self.marys.pk,
                    status=Invoice.Status.PENDING_REVIEW)
        self.client.force_authenticate(self.mary)

        self.assertEqual(self.client.get(reverse("invoice-list")).data["count"], 0)


class ListTests(ManualInvoiceTestCase):
    """The page's own search and filters."""

    def setUp(self):
        super().setUp()
        self.create(customer=self.john.pk, package=self.johns.pk)
        self.create(customer=self.mary.pk, package=self.marys.pk)
        self.johns_invoice = Invoice.objects.get(package=self.johns)

    def get(self, **params):
        params.setdefault("status", "all")
        return self.client.get(self.url(), params).data["results"]

    def test_the_row_carries_enough_to_check_the_pairing(self):
        row = next(r for r in self.get() if r["tracking_number"] == "PLSM-1001")

        self.assertEqual(row["customer_id"], self.john.pk)
        self.assertEqual(row["customer_email"], "john@example.com")
        self.assertIn("John", row["customer"])
        self.assertEqual(row["created_by_name"], str(self.staff))
        self.assertTrue(row["number"].startswith("INV-"))

    def test_it_can_be_filtered_to_one_customer(self):
        rows = self.get(customer=self.mary.pk)

        self.assertEqual([row["tracking_number"] for row in rows], ["PLSM-2001"])

    def test_it_can_be_found_by_its_full_reference(self):
        number = self.johns_invoice.pk

        rows = self.get(search=f"INV-2026-{number:05d}")

        self.assertEqual([row["id"] for row in rows], [number])

    def test_a_bare_number_finds_it_too(self):
        """Looser on purpose, and it has to be.

        The reference match is one of several the search ORs together, so a
        bare "1" also matches PLSM-2001 by substring. That is the right
        trade: a search box that only accepted a full reference would be
        worse at the thing people actually type. What matters is that the
        invoice asked for is among the answers.
        """
        number = self.johns_invoice.pk

        rows = self.get(search=str(number))

        self.assertIn(number, [row["id"] for row in rows])

    def test_it_can_still_be_found_by_tracking_number_and_customer(self):
        for typed in ["PLSM-1001", "john@example.com", "Smith"]:
            with self.subTest(typed=typed):
                rows = self.get(search=typed)
                self.assertEqual([row["tracking_number"] for row in rows], ["PLSM-1001"])


class ShipmentPickerTests(ManualInvoiceTestCase):
    """The list the form narrows once a customer has been chosen."""

    def test_shipments_can_be_narrowed_to_one_customer(self):
        rows = self.client.get(
            reverse("staff-package-list"), {"user": self.john.pk}
        ).data["results"]

        self.assertEqual([row["tracking_number"] for row in rows], ["PLSM-1001"])

    def test_the_row_shows_what_the_admin_needs_to_recognise_it(self):
        row = self.client.get(
            reverse("staff-package-list"), {"user": self.john.pk}
        ).data["results"][0]

        for field in ["tracking_number", "status_display", "destination", "created_at"]:
            with self.subTest(field=field):
                self.assertIn(field, row)
