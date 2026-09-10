"""What the row records about the document, as opposed to where it is.

`Invoice.pdf` answers where the bytes are. Everything tested here answers what
they are — the name to offer them under, how big they are, what type they
claim to be, when they were attached and by whom — and it is recorded on the
row rather than asked of storage each time, because once media lives in a
bucket "ask storage" is a network call per row and a list of forty invoices is
forty of them.

The distinctions that matter, and are easy to collapse by accident:

  created_by              who raised the invoice
  reviewed_by             who approved it
  document_uploaded_by    who chose this particular file

They are the same person in the ordinary case and deliberately not the same
column, because replacing a sent document is the case where they differ and it
is the case where somebody will want to know.
"""

from unittest.mock import patch

from django.urls import reverse
from rest_framework import status

from .models import Invoice
from .test_manual_invoices import A_PDF, ManualInvoiceTestCase, make_user


class ManualUploadTests(ManualInvoiceTestCase):
    """A document that a person chose, through the Add invoice form."""

    def test_the_metadata_is_recorded_when_a_document_is_attached(self):
        response = self.create()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        invoice = Invoice.objects.get()

        # The name we chose, not the one the browser sent: a filename from a
        # browser is decoration and is never trusted onto our storage.
        self.assertNotEqual(invoice.document_filename, "invoice.pdf")
        self.assertIn(invoice.package.tracking_number, invoice.document_filename)
        self.assertTrue(invoice.document_filename.endswith(".pdf"))

        # Read back from storage rather than from the upload, so a truncated
        # write shows up as a disagreement instead of a confident wrong number.
        self.assertEqual(invoice.document_size, len(A_PDF))
        self.assertEqual(invoice.document_content_type, "application/pdf")
        self.assertIsNotNone(invoice.document_uploaded_at)

    def test_the_uploader_is_named(self):
        self.create()

        invoice = Invoice.objects.get()
        self.assertEqual(invoice.document_uploaded_by, self.staff)

    def test_replacing_a_document_names_whoever_replaced_it(self):
        """The case the three columns exist to tell apart."""
        self.create()
        invoice = Invoice.objects.get()

        self.assertEqual(invoice.status, Invoice.Status.SENT)
        first_upload = invoice.document_uploaded_at

        # A second member of staff corrects the document that already went out.
        colleague = make_user("colleague@example.com", is_staff=True,
                              first_name="Second", last_name="Agent")
        self.client.force_authenticate(colleague)

        response = self.client.post(
            reverse("staff-invoice-document", kwargs={"pk": invoice.pk}),
            {"pdf": self.a_pdf(body=A_PDF + b"corrected\n")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        invoice.refresh_from_db()

        # Who raised it and who approved it are unchanged; only who chose the
        # file has moved.
        self.assertEqual(invoice.created_by, self.staff)
        self.assertEqual(invoice.document_uploaded_by, colleague)
        self.assertGreater(invoice.document_uploaded_at, first_upload)
        self.assertEqual(invoice.document_size, len(A_PDF) + len(b"corrected\n"))

    def test_the_size_is_recorded_as_unknown_when_storage_cannot_say(self):
        """Null, which is honest. Zero would read as an empty document."""
        with patch(
            "django.db.models.fields.files.FieldFile.size",
            new_callable=lambda: property(lambda self: (_ for _ in ()).throw(OSError)),
        ):
            response = self.create()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(Invoice.objects.get().document_size)


class RenderedDocumentTests(ManualInvoiceTestCase):
    """A document the worker drew, with no person behind it."""

    def test_an_automatic_render_records_the_metadata_but_names_nobody(self):
        from .tasks import render_approved_invoice

        invoice = Invoice.objects.create(package=self.johns)
        invoice.submit_for_review()
        invoice.approve(self.staff)

        # Called directly. approve() queues it through transaction.on_commit,
        # and inside a TestCase the transaction is rolled back rather than
        # committed, so the hook never fires.
        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.SENT)

        self.assertTrue(invoice.document_filename.endswith(".pdf"))
        self.assertGreater(invoice.document_size, 0)
        self.assertEqual(invoice.document_content_type, "application/pdf")
        self.assertIsNotNone(invoice.document_uploaded_at)

        # The null that is information: nobody chose this file. Naming the
        # approver here would claim they picked a document they never saw.
        self.assertIsNone(invoice.document_uploaded_by)


class SerialisedTests(ManualInvoiceTestCase):
    """What each side is told about the document."""

    def test_the_queue_shows_what_the_document_is_and_who_attached_it(self):
        self.create()
        invoice = Invoice.objects.get()

        row = self.client.get(
            reverse("staff-invoice-detail", kwargs={"pk": invoice.pk})
        ).data

        self.assertEqual(row["document_filename"], invoice.document_filename)
        self.assertEqual(row["document_size"], len(A_PDF))
        self.assertEqual(row["document_content_type"], "application/pdf")
        self.assertEqual(row["document_uploaded_by_name"], str(self.staff))

    def test_the_customer_is_told_the_name_and_size_and_nothing_internal(self):
        self.create()
        invoice = Invoice.objects.get()

        self.client.force_authenticate(self.john)
        row = self.client.get(
            reverse("invoice-detail", kwargs={"pk": invoice.pk})
        ).data

        self.assertEqual(row["filename"], invoice.document_filename)
        self.assertEqual(row["size_bytes"], len(A_PDF))

        # Who inside the office handled it is not the customer's business, and
        # the storage path is not in there either.
        for leaked in ("document_uploaded_by", "document_uploaded_by_name",
                       "reviewed_by", "pdf", "pdf_url"):
            self.assertNotIn(leaked, row)
