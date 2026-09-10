"""The contract between the dashboard and this API.

staff/tests.py proves the rules: who may read what, which transitions the
state machine refuses. This file proves something narrower and easier to break
by accident — that every request frontend/src/api/staff.js actually sends is
answered, and that each answer carries the fields the page reads.

The failure this exists to catch is quiet. Rename a serializer field and no
test about permissions or transitions notices; the API still answers 200, and
the only symptom is a column that renders empty in the back office. Nobody
finds that until somebody in the office needs the number that used to be
there.

Every URL and every query parameter below is copied from the frontend rather
than reverse-engineered from the views, so if the two stop agreeing this is
the file that says so.
"""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from accounts.models import Package, PackageDocument
from bookings.models import Booking
from config.testing import ThrottleFreeAPITestCase
from enquiries.models import ContactMessage, QuoteRequest
from invoicing.services import ensure_invoice_for_package

User = get_user_model()


def booking_fields():
    """A complete booking, as bookings/tests.py builds one."""
    return {
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
    }


class DashboardContractTestCase(ThrottleFreeAPITestCase):
    """One staff session, and one row of every kind the dashboard lists."""

    def setUp(self):
        super().setUp()

        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
            first_name="Voorbeeld",
            last_name="Klant",
            phone_number="+599 9 123 4567",
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

        self.quote = QuoteRequest.objects.create(
            destination="Curaçao",
            first_name="Voorbeeld",
            last_name="Klant",
            email="klant@example.com",
            message="Graag een offerte voor twee dozen.",
        )
        self.message = ContactMessage.objects.create(
            name="Voorbeeld Klant",
            email="klant@example.com",
            subject="Vraag",
            message="Hoe lang duurt verzending naar Bonaire?",
        )
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Twee dozen",
            status=Package.Status.PAID,
            value_eur="149.95",
        )
        self.booking = Booking.objects.create(**booking_fields())
        self.invoice = ensure_invoice_for_package(self.package)
        self.document = PackageDocument.objects.create(
            customer=self.customer,
            package=self.package,
            uploaded_by=self.customer,
            kind=PackageDocument.Kind.RECEIPT,
            note="Kassabon televisie",
            file=SimpleUploadedFile("bon.pdf", b"%PDF-1.4", "application/pdf"),
            original_name="bon.pdf",
            content_type="application/pdf",
            size_bytes=8,
        )

        self.client.force_authenticate(self.staff)

    def assertHasFields(self, row, fields, where):
        """Every field the page reads is present, even where it is null.

        Presence, not truth: a column reading an absent key renders nothing
        and looks like an empty record rather than a broken one.
        """
        missing = sorted(field for field in fields if field not in row)
        self.assertEqual(
            missing, [], f"{where} is missing {missing}; the dashboard reads it"
        )

    def page(self, url, **params):
        """A list request, and the paginated envelope src/api/staff.js expects."""
        response = self.client.get(url, params)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"{url} answered {response.status_code}",
        )

        body = response.json()
        # toPage() in the frontend reads exactly these. A bare list would make
        # every table render empty rather than error.
        self.assertIn("results", body, f"{url} is not paginated")
        self.assertIn("count", body, f"{url} has no count for the pager")
        return body


class OverviewContractTests(DashboardContractTestCase):
    """The landing page. Everything on it comes from this one request."""

    def test_answers_every_block_the_page_reads(self):
        response = self.client.get(reverse("staff-overview"), {"days": 30})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertHasFields(
            response.json(),
            [
                "quotes",
                "messages",
                "packages",
                "customers",
                "invoices",
                "daily",
                "ranges",
                "recent_packages",
                "recent_quotes",
                "recent_messages",
            ],
            "the overview",
        )

    def test_the_queue_counts_the_sidebar_badges_read(self):
        body = self.client.get(reverse("staff-overview")).json()

        # The three figures that add up to "somebody has to act", both on the
        # overview and on the sidebar pills.
        self.assertIn("new", body["quotes"])
        self.assertIn("unhandled", body["messages"])
        self.assertIn("pending_review", body["invoices"])

    def test_every_range_the_picker_offers_is_accepted(self):
        for days in (7, 30, 90):
            with self.subTest(days=days):
                body = self.client.get(
                    reverse("staff-overview"), {"days": days}
                ).json()

                # One row per day, including the days nothing happened, or the
                # chart draws a line with gaps in it.
                self.assertEqual(len(body["daily"]), days)

    def test_a_range_outside_the_list_falls_back_rather_than_failing(self):
        # The picker cannot send this, but a stale bookmark can.
        response = self.client.get(reverse("staff-overview"), {"days": 100000})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()["daily"]), 30)

    def test_a_day_on_the_chart_carries_every_series(self):
        body = self.client.get(reverse("staff-overview")).json()

        # The sparkline adds these three together; a missing key would make
        # the sum NaN and the chart disappear.
        self.assertHasFields(
            body["daily"][0],
            ["date", "quotes", "packages", "messages"],
            "a day on the activity chart",
        )


class ListContractTests(DashboardContractTestCase):
    """Every table, with the fields its columns read."""

    def test_quotes(self):
        body = self.page(reverse("staff-quote-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "destination",
                "email",
                "file_url",
                "full_name",
                "language",
                "message",
                "status",
            ],
            "a quote row",
        )

    def test_messages(self):
        body = self.page(reverse("staff-message-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "email",
                "handled",
                "language",
                "message",
                "name",
                "subject",
            ],
            "a message row",
        )

    def test_packages(self):
        body = self.page(reverse("staff-package-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "customer",
                "delivered_at",
                "delivery_address_text",
                "description",
                "documents",
                "invoice",
                "shipped_at",
                "status",
                "status_display",
                "tracking_number",
                "value_eur",
                "weight_kg",
            ],
            "a package row",
        )

    def test_a_package_carries_its_invoice_and_its_documents(self):
        row = self.page(reverse("staff-package-list"))["results"][0]

        # Both are rendered inline in the expanded row, so both have to arrive
        # with the list rather than needing a request each.
        self.assertHasFields(
            row["invoice"], ["id", "status", "status_display"], "a package's invoice"
        )
        self.assertHasFields(
            row["documents"][0],
            ["id", "download_url", "filename", "kind_display", "note"],
            "a package's document",
        )

    def test_bookings(self):
        body = self.page(reverse("staff-booking-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "shipping_number",
                "status",
                "status_display",
                "destination_label",
                "freight_display",
                "packing_display",
                "packing_quality",
                "payment_display",
                "unit_display",
                "vehicle_display",
                "sender_name",
                "sender_address",
                "sender_city",
                "sender_postal_code",
                "sender_phone",
                "sender_email",
                "recipient_name",
                "recipient_address",
                "recipient_city",
                "recipient_phone",
                "contents",
                "contents_attached",
                "quantity",
                "value_eur",
                "volume_m3",
                "weight_kg",
                "insured",
                "insured_value_eur",
                "emigration",
                "deregistered",
                "deregistration_present",
                "id_present",
                "notes",
                "signature_name",
                "signed_at",
                "agreed_terms",
            ],
            "a booking row",
        )

    def test_invoices(self):
        # `status=all` is what the frontend sends for "any status"; without it
        # the server answers only the review queue.
        body = self.page(reverse("staff-invoice-list"), status="all")

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "customer",
                "pdf_url",
                "rejection_reason",
                "reviewed_at",
                "reviewed_by_name",
                "sent_at",
                "status",
                "status_display",
                "tracking_number",
                "value_eur",
            ],
            "an invoice row",
        )

    def test_the_invoice_queue_is_the_default(self):
        # The page opens on the work waiting to be done, and asks for it by
        # name. Both spellings have to keep working.
        queued = self.page(reverse("staff-invoice-list"), status="pending_review")

        self.assertEqual(queued["count"], 1)

    def test_customers(self):
        body = self.page(reverse("staff-customer-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "addresses",
                "can_change_role",
                "date_joined",
                "email",
                "first_name",
                "last_name",
                "name",
                "is_active",
                "is_erased",
                "is_staff",
                "is_superuser",
                "outstanding_eur",
                "package_count",
                "paid_eur",
                "phone_number",
                "username",
            ],
            "a customer row",
        )

    def test_documents(self):
        # Note the path: the dashboard reads the customers' own upload
        # endpoint rather than one under /api/staff/.
        body = self.page(reverse("package-document-list"))

        self.assertHasFields(
            body["results"][0],
            [
                "id",
                "created_at",
                "customer",
                "customer_name",
                "download_url",
                "filename",
                "kind",
                "kind_display",
                "note",
                "package",
                "size_bytes",
                "uploaded_by_name",
            ],
            "a document row",
        )


class FilterContractTests(DashboardContractTestCase):
    """Every filter, search and ordering the dashboard can send.

    A parameter the server does not recognise is not an error — it is silently
    ignored, and the table shows unfiltered rows while the control claims to
    have filtered them. That is worse than a failure, so each one is checked
    for having actually done something.
    """

    def test_quote_filters(self):
        self.page(reverse("staff-quote-list"), search="Klant", status="new",
                  destination="Curaçao", ordering="-created_at", page=1)

        filtered = self.page(reverse("staff-quote-list"), status="declined")
        self.assertEqual(filtered["count"], 0, "?status= did not filter quotes")

        found = self.page(reverse("staff-quote-list"), search="offerte")
        self.assertEqual(found["count"], 1, "?search= did not reach the message")

    def test_message_handled_filter_is_a_boolean_in_a_query_string(self):
        # `handled` cannot go through the ordinary exact-match filters, so it
        # has its own branch on the server. Both spellings the <select> sends.
        self.assertEqual(
            self.page(reverse("staff-message-list"), handled="false")["count"], 1
        )
        self.assertEqual(
            self.page(reverse("staff-message-list"), handled="true")["count"], 0
        )

    def test_package_filters(self):
        self.assertEqual(
            self.page(reverse("staff-package-list"), status="paid")["count"], 1
        )
        self.assertEqual(
            self.page(reverse("staff-package-list"), status="delivered")["count"], 0
        )
        self.assertEqual(
            self.page(reverse("staff-package-list"), search="PLSM-0001")["count"], 1
        )

    def test_booking_filters(self):
        self.assertEqual(
            self.page(reverse("staff-booking-list"), status="new")["count"], 1
        )
        self.assertEqual(
            self.page(reverse("staff-booking-list"), destination="CW")["count"], 1
        )
        self.assertEqual(
            self.page(reverse("staff-booking-list"), freight="air")["count"], 0
        )

    def test_customer_search(self):
        self.assertEqual(
            self.page(reverse("staff-customer-list"), search="klant@example.com")[
                "count"
            ],
            1,
        )

    def test_document_filters(self):
        self.assertEqual(
            self.page(reverse("package-document-list"), kind="receipt")["count"], 1
        )
        self.assertEqual(
            self.page(reverse("package-document-list"), kind="customs")["count"], 0
        )
        # The queue that matters: a document filed against no shipment yet.
        self.assertEqual(
            self.page(reverse("package-document-list"), unattached="true")["count"], 0
        )

    def test_ordering_is_an_allow_list_and_a_bad_one_does_not_break_the_page(self):
        # `?ordering=` is the one parameter that reaches the ORM as a column
        # name. An unknown value has to be ignored, not raise.
        response = self.client.get(
            reverse("staff-package-list"), {"ordering": "user__password"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class WriteContractTests(DashboardContractTestCase):
    """The controls in the tables, with the bodies the frontend sends."""

    def test_a_quote_status_is_changed_with_a_patch(self):
        response = self.client.patch(
            reverse("staff-quote-detail", args=[self.quote.pk]),
            {"status": "quoted"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Answers with the whole row: the table swaps it in rather than
        # refetching the page and losing the reader's place.
        self.assertEqual(response.json()["status"], "quoted")

    def test_a_message_is_marked_handled(self):
        response = self.client.patch(
            reverse("staff-message-detail", args=[self.message.pk]),
            {"handled": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(response.json()["handled"], True)

    def test_a_package_status_is_changed(self):
        response = self.client.patch(
            reverse("staff-package-detail", args=[self.package.pk]),
            {"status": "in_transit"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "in_transit")

    def test_a_booking_status_and_the_office_fields_are_writable(self):
        response = self.client.patch(
            reverse("staff-booking-detail", args=[self.booking.pk]),
            {"status": "confirmed", "office_notes": "Gebeld, akkoord."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "confirmed")

    def test_a_customer_contact_correction(self):
        response = self.client.patch(
            reverse("staff-customer-detail", args=[self.customer.pk]),
            {"phone_number": "+599 9 111 2222"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["phone_number"], "+599 9 111 2222")

    def test_a_customer_address_is_added_and_then_corrected(self):
        url = reverse("staff-customer-address", args=[self.customer.pk])
        address = {
            "label": "Thuis",
            "street": "Kaya Grandi",
            "house_number": "24",
            "postal_code": "",
            "city": "Willemstad",
            "country": "CW",
            "is_default": True,
        }

        created = self.client.post(url, address, format="json")
        self.assertEqual(created.status_code, status.HTTP_200_OK)

        # Answers with the whole customer, addresses included, which is what
        # the table swaps in.
        addresses = created.json()["addresses"]
        self.assertEqual(len(addresses), 1)

        # The same endpoint corrects one, told apart by carrying an id.
        corrected = self.client.post(
            url, {**address, "id": addresses[0]["id"], "city": "Barber"}, format="json"
        )
        self.assertEqual(corrected.status_code, status.HTTP_200_OK)
        self.assertEqual(len(corrected.json()["addresses"]), 1)

    def test_a_role_change(self):
        response = self.client.post(
            reverse("staff-customer-role", args=[self.customer.pk]),
            {"role": "admin"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(response.json()["is_staff"], True)

    def test_the_role_control_cannot_be_turned_on_yourself(self):
        # can_change_role on the row is what disables the select; this is the
        # refusal behind it, which holds whatever the browser sends.
        response = self.client.post(
            reverse("staff-customer-role", args=[self.staff.pk]),
            {"role": "customer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_approving_an_invoice(self):
        response = self.client.post(
            reverse("staff-invoice-approve", args=[self.invoice.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.json()["status"], {"approved", "sent"})

    def test_rejecting_an_invoice_with_the_reason_the_form_sends(self):
        response = self.client.post(
            reverse("staff-invoice-reject", args=[self.invoice.pk]),
            {"rejection_reason": "Bedrag klopt niet met de bon."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "rejected")

    def test_approving_something_already_moved_is_refused_not_broken(self):
        self.client.post(reverse("staff-invoice-reject", args=[self.invoice.pk]),
                         {"rejection_reason": "Verkeerd bedrag."}, format="json")

        # Two people with the queue open. The frontend reads this as "somebody
        # else moved it first", which is only true if it is a 409.
        again = self.client.post(reverse("staff-invoice-approve", args=[self.invoice.pk]))

        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)

    def test_uploading_an_invoice_document_by_hand(self):
        self.client.post(reverse("staff-invoice-approve", args=[self.invoice.pk]))

        response = self.client.post(
            reverse("staff-invoice-document", args=[self.invoice.pk]),
            {"pdf": SimpleUploadedFile("factuur.pdf", b"%PDF-1.4", "application/pdf")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "sent")

    def test_raising_an_invoice_for_a_shipment_that_has_none(self):
        package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0002",
            description="Een doos",
            status=Package.Status.PAID,
            value_eur="49.95",
        )

        url = reverse("staff-package-invoice", args=[package.pk])
        first = self.client.post(url)

        self.assertIn(first.status_code, {status.HTTP_200_OK, status.HTTP_201_CREATED})

        # Idempotent: the button is pressed twice by anyone unsure whether the
        # first press worked.
        second = self.client.post(url)
        self.assertIn(second.status_code, {status.HTTP_200_OK, status.HTTP_201_CREATED})

    def test_filing_a_document_against_a_shipment_and_taking_it_off_again(self):
        url = reverse("package-document-attach", args=[self.document.pk])

        detached = self.client.post(url, {"package": None}, format="json")
        self.assertEqual(detached.status_code, status.HTTP_200_OK)
        self.assertIsNone(detached.json()["package"])

        attached = self.client.post(url, {"package": self.package.pk}, format="json")
        self.assertEqual(attached.status_code, status.HTTP_200_OK)
        self.assertEqual(attached.json()["package"], self.package.pk)
