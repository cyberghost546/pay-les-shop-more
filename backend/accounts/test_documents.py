"""Tests for the paperwork customers send in.

An invoice is a document the business sends out; these go the other way. What
is worth proving is the boundary — that a customer can only attach to their
own shipment and can only read their own files — and that nothing about an
uploaded file is taken on trust.
"""

import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Package, PackageDocument

User = get_user_model()

# The first bytes of each kind we accept, as a real file would start.
A_PDF = b"%PDF-1.4 a receipt"
A_PNG = b"\x89PNG\r\n\x1a\n and some pixels"
A_JPEG = b"\xff\xd8\xff\xe0 and some pixels"


class PackageDocumentTestCase(APITestCase):
    """One customer with a shipment, one stranger, one staff member.

    MEDIA_ROOT is redirected at a temporary directory for the whole class, so
    these write real files through real storage — the interesting failures are
    storage failures — and leave nothing behind in backend/media.
    """

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
            first_name="Voorbeeld",
            last_name="Klant",
            phone_number="+599 9 123 4567",
        )
        self.stranger = User.objects.create_user(
            username="ander@example.com",
            email="ander@example.com",
            password="a-long-enough-password",
            first_name="Andere",
            last_name="Klant",
            phone_number="+599 9 111 2222",
        )
        self.staff = User.objects.create_user(
            username="agent@example.com",
            email="agent@example.com",
            password="a-long-enough-password",
            first_name="Back",
            last_name="Office",
            phone_number="+599 9 765 4321",
            is_staff=True,
        )

        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Een televisie",
            value_eur="899.00",
        )

    def a_file(self, name="kassabon.pdf", body=A_PDF, content_type="application/pdf"):
        return SimpleUploadedFile(name, body, content_type=content_type)

    def upload(self, **extra):
        payload = {"package": self.package.pk, "file": self.a_file()}
        payload.update(extra)
        return self.client.post(
            reverse("package-document-list"), payload, format="multipart"
        )


class CustomerUploadTests(PackageDocumentTestCase):
    """A customer attaching the receipt for what they bought."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.customer)

    def test_a_customer_can_attach_a_receipt_to_their_own_shipment(self):
        response = self.upload(note="Kassabon MediaMarkt")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = PackageDocument.objects.get()
        self.assertEqual(document.package, self.package)
        self.assertEqual(document.uploaded_by, self.customer)
        self.assertEqual(document.kind, PackageDocument.Kind.RECEIPT)
        self.assertEqual(document.note, "Kassabon MediaMarkt")
        self.assertEqual(document.size_bytes, len(A_PDF))
        # The bytes really are on disk.
        self.assertTrue(os.path.exists(document.file.path))

    def test_a_jpeg_and_a_png_are_accepted_too(self):
        """A receipt is as likely to be a photograph as a PDF."""
        png = self.upload(file=self.a_file("bon.png", A_PNG, "image/png"))
        jpeg = self.upload(file=self.a_file("bon.jpg", A_JPEG, "image/jpeg"))

        self.assertEqual(png.status_code, status.HTTP_201_CREATED)
        self.assertEqual(jpeg.status_code, status.HTTP_201_CREATED)

    def test_the_response_never_carries_the_storage_path(self):
        """The whole reason the file is served by a view: a MEDIA_URL link to
        somebody's receipt is guarded by nothing but the filename."""
        response = self.upload()
        document = PackageDocument.objects.get()

        body = str(response.data)
        self.assertNotIn(document.file.name, body)
        self.assertNotIn("/media/", body)
        self.assertIn("download_url", response.data)

    def test_a_customer_cannot_attach_to_someone_elses_shipment(self):
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )

        response = self.upload(package=theirs.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PackageDocument.objects.count(), 0)

    def test_a_shipment_that_does_not_exist_answers_the_same_way(self):
        """Telling "not yours" apart from "no such thing" would turn this into
        a way to discover which tracking numbers are real."""
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )

        not_yours = self.upload(package=theirs.pk)
        no_such_thing = self.upload(package=999999)

        self.assertEqual(not_yours.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(no_such_thing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(not_yours.data["package"]), str(no_such_thing.data["package"])
        )

    def test_a_file_that_is_not_what_it_claims_is_refused(self):
        """Named .pdf, announced as a PDF, and actually something else. The
        first bytes are what decides."""
        response = self.upload(
            file=self.a_file("nette-naam.pdf", b"MZ\x90\x00 an executable")
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(PackageDocument.objects.count(), 0)

    def test_an_html_page_saved_as_a_jpg_is_refused(self):
        response = self.upload(
            file=self.a_file("bon.jpg", b"<!DOCTYPE html><script>", "image/jpeg")
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_extension_we_do_not_accept_is_refused(self):
        response = self.upload(file=self.a_file("bon.svg", b"<svg/>", "image/svg+xml"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_empty_file_is_refused(self):
        response = self.upload(file=self.a_file("leeg.pdf", b""))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_file_over_the_limit_is_refused(self):
        too_big = A_PDF + b"x" * PackageDocument.MAX_BYTES

        response = self.upload(file=self.a_file("groot.pdf", too_big))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PackageDocument.objects.count(), 0)

    def test_the_list_shows_only_the_callers_own_files(self):
        self.upload()
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )
        PackageDocument.objects.create(
            customer=self.stranger,
            package=theirs,
            uploaded_by=self.stranger,
            file=self.a_file(),
        )

        response = self.client.get(reverse("package-document-list"))

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["tracking_number"], "PLSM-0001"
        )

    def test_a_customer_can_download_their_own_file(self):
        self.upload()
        document = PackageDocument.objects.get()

        response = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(response.streaming_content), A_PDF)

    def test_a_customer_cannot_download_someone_elses_file(self):
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )
        document = PackageDocument.objects.create(
            customer=self.stranger,
            package=theirs,
            uploaded_by=self.stranger,
            file=self.a_file(),
        )

        response = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_customer_can_withdraw_what_they_sent_in(self):
        """The wrong photograph, the wrong parcel. Deleting the row must take
        the bytes with it — for a document holding an address and card digits,
        leaving them on disk is the one thing a delete button must not do."""
        self.upload()
        document = PackageDocument.objects.get()
        path = document.file.path
        self.assertTrue(os.path.exists(path))

        response = self.client.delete(
            reverse("package-document-detail", args=[document.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(PackageDocument.objects.count(), 0)
        self.assertFalse(os.path.exists(path))

    def test_a_customer_cannot_delete_someone_elses_file(self):
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )
        document = PackageDocument.objects.create(
            customer=self.stranger,
            package=theirs,
            uploaded_by=self.stranger,
            file=self.a_file(),
        )

        response = self.client.delete(
            reverse("package-document-detail", args=[document.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(PackageDocument.objects.count(), 1)

    def test_an_anonymous_caller_can_do_none_of_it(self):
        self.upload()
        document = PackageDocument.objects.get()
        self.client.force_authenticate(None)

        listing = self.client.get(reverse("package-document-list"))
        download = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )
        posting = self.upload()

        for response in (listing, download, posting):
            self.assertIn(
                response.status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
            )


class StaffSeesCustomerUploadsTests(PackageDocumentTestCase):
    """The point of letting customers upload at all: the office can read it."""

    def test_staff_see_the_file_on_the_shipment_row(self):
        self.client.force_authenticate(self.customer)
        self.upload(note="Kassabon voor de televisie")

        self.client.force_authenticate(self.staff)
        response = self.client.get(reverse("staff-package-list"))

        row = next(
            r for r in response.data["results"] if r["tracking_number"] == "PLSM-0001"
        )
        self.assertEqual(len(row["documents"]), 1)
        self.assertEqual(row["documents"][0]["note"], "Kassabon voor de televisie")
        self.assertEqual(row["documents"][0]["uploaded_by_name"], "Voorbeeld Klant")
        self.assertIn("download_url", row["documents"][0])

    def test_staff_can_download_a_customers_file(self):
        self.client.force_authenticate(self.customer)
        self.upload()
        document = PackageDocument.objects.get()

        self.client.force_authenticate(self.staff)
        response = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(response.streaming_content), A_PDF)

    def test_staff_see_every_customers_files_not_only_their_own(self):
        self.client.force_authenticate(self.customer)
        self.upload()

        self.client.force_authenticate(self.staff)
        response = self.client.get(reverse("package-document-list"))

        self.assertEqual(response.data["count"], 1)

    def test_staff_can_attach_a_file_for_a_customer(self):
        """A receipt e-mailed to the office rather than uploaded."""
        self.client.force_authenticate(self.staff)

        response = self.upload(note="Doorgestuurd per e-mail")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = PackageDocument.objects.get()
        self.assertEqual(document.package, self.package)
        self.assertEqual(document.uploaded_by, self.staff)

    def test_the_download_name_cannot_carry_a_path(self):
        """The name comes from the customer's own machine. It is shown back to
        them because they recognise it, which means it reaches a header."""
        self.client.force_authenticate(self.customer)
        self.upload(file=self.a_file(name="../../etc/passwd.pdf"))

        document = PackageDocument.objects.get()

        self.assertNotIn("/", document.filename)
        self.assertNotIn("..", document.filename)


class UnattachedDocumentTests(PackageDocumentTestCase):
    """A receipt that does not belong to a shipment yet.

    The case that was impossible until the shipment became optional: somebody
    buys a television, has the till receipt in their hand, and books the
    shipment days later. Requiring the link meant a customer with no shipments
    saw a section with no upload box in it at all, which read as the feature
    being missing rather than as a precondition being unmet.
    """

    def setUp(self):
        super().setUp()
        # A customer with an account and nothing shipped yet — which is what
        # every customer is on the day they sign up.
        self.newcomer = User.objects.create_user(
            username="nieuw@example.com",
            email="nieuw@example.com",
            password="a-long-enough-password",
            first_name="Nieuwe",
            last_name="Klant",
            phone_number="+599 9 333 4444",
        )
        self.client.force_authenticate(self.newcomer)

    def upload_without_shipment(self, **extra):
        payload = {"file": self.a_file(), "kind": "receipt"}
        payload.update(extra)
        return self.client.post(
            reverse("package-document-list"), payload, format="multipart"
        )

    def test_a_customer_with_no_shipments_can_still_upload(self):
        response = self.upload_without_shipment(note="Kassabon televisie")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = PackageDocument.objects.get()
        self.assertEqual(document.customer, self.newcomer)
        self.assertIsNone(document.package_id)
        self.assertEqual(document.note, "Kassabon televisie")

    def test_the_row_says_there_is_no_shipment_rather_than_guessing_one(self):
        response = self.upload_without_shipment()

        self.assertIsNone(response.data["package"])
        self.assertIsNone(response.data["tracking_number"])

    def test_they_can_list_and_download_it(self):
        """Scoping used to go through the shipment, so an unattached file
        would have been invisible to the person who uploaded it."""
        self.upload_without_shipment()
        document = PackageDocument.objects.get()

        listing = self.client.get(reverse("package-document-list"))
        download = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )

        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(download.streaming_content), A_PDF)

    def test_the_download_name_still_works_without_a_tracking_number(self):
        """The name is built from the shipment when there is one. There is
        not, so it must fall back rather than raise.

        original_name is blanked directly rather than uploaded empty: a
        browser always sends a name and Django refuses an empty one long
        before this code sees it, so uploading "" would test Django's
        validator instead of this fallback.
        """
        self.upload_without_shipment()
        document = PackageDocument.objects.get()
        document.original_name = ""
        document.save(update_fields=["original_name"])

        self.assertTrue(document.filename.endswith(".pdf"))
        self.assertNotIn("None", document.filename)
        self.assertIn(str(document.pk), document.filename)

    def test_another_customer_still_cannot_see_it(self):
        """The boundary has to survive the scoping column changing."""
        self.upload_without_shipment()
        document = PackageDocument.objects.get()

        self.client.force_authenticate(self.stranger)
        listing = self.client.get(reverse("package-document-list"))
        download = self.client.get(
            reverse("package-document-file", args=[document.pk])
        )

        self.assertEqual(listing.data["count"], 0)
        self.assertEqual(download.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_can_see_it(self):
        """Otherwise the office would never learn the receipt had arrived."""
        self.upload_without_shipment(note="Kassabon televisie")

        self.client.force_authenticate(self.staff)
        listing = self.client.get(reverse("package-document-list"))

        self.assertEqual(listing.data["count"], 1)
        row = listing.data["results"][0]
        self.assertIsNone(row["tracking_number"])
        self.assertEqual(row["customer_name"], "Nieuwe Klant")

    def test_a_staff_upload_is_filed_under_the_customer_not_the_agent(self):
        """A receipt e-mailed to the office. It is the customer's paperwork,
        so it has to sit on their account rather than on the agent's."""
        self.client.force_authenticate(self.staff)

        self.client.post(
            reverse("package-document-list"),
            {"package": self.package.pk, "file": self.a_file()},
            format="multipart",
        )

        document = PackageDocument.objects.get()
        self.assertEqual(document.customer, self.customer)
        self.assertEqual(document.uploaded_by, self.staff)

    def test_erasing_the_account_takes_the_receipts_with_it(self):
        """They are the customer's own documents, not a record of what the
        business did — which is what invoices are, and why those are kept."""
        self.upload_without_shipment()
        self.assertEqual(PackageDocument.objects.count(), 1)

        self.newcomer.delete()

        self.assertEqual(PackageDocument.objects.count(), 0)


class StaffDocumentsPageTests(PackageDocumentTestCase):
    """What the dashboard's Documents page reads.

    Before it there was nowhere in the back office to see a document that had
    no shipment: the Packages page shows them nested under a parcel, so a
    receipt filed against none was invisible to the office it was sent to.
    """

    def setUp(self):
        super().setUp()

        self.client.force_authenticate(self.customer)
        # One filed against the shipment, one not — the two states the page
        # exists to tell apart.
        self.upload(note="Kassabon televisie")
        self.client.post(
            reverse("package-document-list"),
            {"file": self.a_file("bon.png", A_PNG, "image/png"),
             "kind": "invoice",
             "note": "Factuur MediaMarkt"},
            format="multipart",
        )
        self.client.force_authenticate(self.staff)

    def rows(self, **params):
        return self.client.get(
            reverse("package-document-list"), params
        ).json()["results"]

    def test_staff_see_who_it_is_from_and_what_it_is_for(self):
        """The whole question the page answers."""
        rows = self.rows()

        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertEqual(row["customer_name"], "Voorbeeld Klant")
            self.assertTrue(row["note"])
            self.assertTrue(row["kind_display"])
            self.assertIn("download_url", row)

    def test_the_unattached_filter_finds_what_nobody_has_filed(self):
        rows = self.rows(unattached="true")

        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["tracking_number"])
        self.assertEqual(rows[0]["note"], "Factuur MediaMarkt")

    def test_the_kind_filter_narrows_to_one_sort(self):
        rows = self.rows(kind="invoice")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["kind"], "invoice")

    def test_searching_finds_a_document_by_customer_note_or_tracking(self):
        by_name = self.rows(search="Voorbeeld")
        by_note = self.rows(search="MediaMarkt")
        by_tracking = self.rows(search="PLSM-0001")

        self.assertEqual(len(by_name), 2)
        self.assertEqual(len(by_note), 1)
        self.assertEqual(len(by_tracking), 1)

    def test_staff_can_file_an_unattached_document_against_a_shipment(self):
        loose = PackageDocument.objects.get(package__isnull=True)

        response = self.client.post(
            reverse("package-document-attach", args=[loose.pk]),
            {"package": self.package.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "PLSM-0001")
        loose.refresh_from_db()
        self.assertEqual(loose.package, self.package)

    def test_filing_does_not_change_whose_document_it_is(self):
        """Moving a receipt between parcels must not quietly reassign it."""
        loose = PackageDocument.objects.get(package__isnull=True)
        theirs = Package.objects.create(
            user=self.stranger, tracking_number="PLSM-0002"
        )

        self.client.post(
            reverse("package-document-attach", args=[loose.pk]),
            {"package": theirs.pk},
            format="json",
        )

        loose.refresh_from_db()
        self.assertEqual(loose.package, theirs)
        self.assertEqual(loose.customer, self.customer)

    def test_a_document_can_be_taken_off_a_shipment_again(self):
        """A receipt on the wrong parcel has to be able to come off it."""
        filed = PackageDocument.objects.get(package__isnull=False)

        response = self.client.post(
            reverse("package-document-attach", args=[filed.pk]),
            {"package": None},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        filed.refresh_from_db()
        self.assertIsNone(filed.package_id)

    def test_a_shipment_that_does_not_exist_is_refused(self):
        loose = PackageDocument.objects.get(package__isnull=True)

        response = self.client.post(
            reverse("package-document-attach", args=[loose.pk]),
            {"package": 999999},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_customer_cannot_file_their_own_document(self):
        """They choose a shipment when they upload. Moving one afterwards is
        moving evidence between shipments, and the office is the party that
        has to be able to trust where a receipt is filed."""
        loose = PackageDocument.objects.get(package__isnull=True)
        self.client.force_authenticate(self.customer)

        response = self.client.post(
            reverse("package-document-attach", args=[loose.pk]),
            {"package": self.package.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        loose.refresh_from_db()
        self.assertIsNone(loose.package_id)

    def test_the_overview_counts_what_is_waiting_to_be_filed(self):
        """The sidebar's pill."""
        response = self.client.get(reverse("staff-overview"))

        self.assertEqual(response.data["documents"]["total"], 2)
        self.assertEqual(response.data["documents"]["unattached"], 1)
