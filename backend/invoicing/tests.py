"""Tests for the invoice approval workflow.

Two things are worth proving here. The first is the state machine: that an
invoice cannot skip a state or be approved twice, and that this holds at the
model layer rather than only at the view, so a second caller added later
inherits the rule. The second is the boundary: that a signed-in customer who is
not staff cannot approve or reject anything by calling the endpoint directly,
with no React app in the way.
"""

import os
import shutil
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Package
from invoicing.models import InvalidInvoiceTransition, Invoice
from invoicing.pdf import invoice_number, render_invoice_pdf
from invoicing.services import ensure_invoice_for_package
from invoicing.tasks import render_approved_invoice

User = get_user_model()


class InvoiceTestCase(APITestCase):
    """Shared fixtures: one customer, two staff members, one paid package."""

    def setUp(self):
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
        self.other_staff = User.objects.create_user(
            username="agent2@example.com",
            email="agent2@example.com",
            password="a-long-enough-password",
            first_name="Second",
            last_name="Reviewer",
            phone_number="+599 9 765 4322",
            is_staff=True,
        )

        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Twee dozen",
            status=Package.Status.PAID,
            value_eur="149.95",
        )

    def make_invoice(self, **kwargs):
        """An invoice sitting in the review queue, which is where the flow starts."""
        package = kwargs.pop("package", self.package)
        return ensure_invoice_for_package(package)

    def approve_url(self, invoice):
        return reverse("staff-invoice-approve", args=[invoice.pk])

    def reject_url(self, invoice):
        return reverse("staff-invoice-reject", args=[invoice.pk])


class InvoiceCreationTests(InvoiceTestCase):
    """Where an invoice comes from."""

    def test_paying_a_package_raises_an_invoice_in_the_queue(self):
        """The service creates it in DRAFT and leaves it in PENDING_REVIEW."""
        invoice = ensure_invoice_for_package(self.package)

        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertEqual(invoice.package, self.package)
        # Nothing has been reviewed yet, so it carries no verdict.
        self.assertIsNone(invoice.reviewed_by)
        self.assertIsNone(invoice.reviewed_at)
        self.assertEqual(invoice.rejection_reason, "")
        self.assertIsNone(invoice.sent_at)

    def test_the_service_is_idempotent(self):
        """Marking a package paid twice must not raise a second invoice, nor
        reset a review already under way."""
        first = ensure_invoice_for_package(self.package)
        first.approve(self.staff)

        second = ensure_invoice_for_package(self.package)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Invoice.objects.count(), 1)
        # The approval survived.
        self.assertEqual(second.status, Invoice.Status.APPROVED)

    def test_marking_a_package_paid_over_the_api_raises_the_invoice(self):
        """The hook point: PackageViewSet.perform_update, not a signal."""
        package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0002",
            status=Package.Status.QUOTED,
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(
            reverse("staff-package-detail", args=[package.pk]),
            {"status": Package.Status.PAID},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice = Invoice.objects.get(package=package)
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_a_later_edit_to_a_paid_package_does_not_raise_another(self):
        """Entering PAID is the event; being in it is not."""
        invoice = ensure_invoice_for_package(self.package)
        invoice.reject(self.staff, "Wrong amount.")
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(
            reverse("staff-package-detail", args=[self.package.pk]),
            {"description": "Twee dozen en een koffer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Invoice.objects.count(), 1)
        invoice.refresh_from_db()
        # Untouched: still rejected, still carrying the reason.
        self.assertEqual(invoice.status, Invoice.Status.REJECTED)


class InvoiceStateMachineTests(InvoiceTestCase):
    """The rules, exercised at the model layer with no view involved.

    This is the point of putting them on the model: these pass without a
    request, so any future caller — a management command, the sending job, the
    shell — is held to the same rules.
    """

    def test_approve_records_who_and_when(self):
        invoice = self.make_invoice()

        invoice.approve(self.staff)

        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertEqual(invoice.reviewed_by, self.staff)
        self.assertIsNotNone(invoice.reviewed_at)

    def test_an_invoice_cannot_be_approved_twice(self):
        """Not "the second call is a no-op" — it is an error, so the second
        reviewer is told rather than silently credited with the approval."""
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        with self.assertRaises(InvalidInvoiceTransition):
            invoice.approve(self.other_staff)

        invoice.refresh_from_db()
        # The first reviewer's name is still the one on the record.
        self.assertEqual(invoice.reviewed_by, self.staff)

    def test_a_stale_copy_cannot_approve_an_already_approved_invoice(self):
        """The race the conditional UPDATE exists for.

        `stale` was read while the invoice was pending and still believes that,
        which is exactly what a second concurrent request would hold. The
        in-Python check passes; the database is what refuses.
        """
        invoice = self.make_invoice()
        stale = Invoice.objects.get(pk=invoice.pk)
        invoice.approve(self.staff)

        self.assertEqual(stale.status, Invoice.Status.PENDING_REVIEW)
        with self.assertRaises(InvalidInvoiceTransition):
            stale.approve(self.other_staff)

        invoice.refresh_from_db()
        self.assertEqual(invoice.reviewed_by, self.staff)

    def test_reject_requires_a_reason(self):
        invoice = self.make_invoice()

        with self.assertRaises(InvalidInvoiceTransition):
            invoice.reject(self.staff, "   ")

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_a_rejected_invoice_goes_back_to_the_queue_with_a_clean_slate(self):
        invoice = self.make_invoice()
        invoice.reject(self.staff, "The declared value is wrong.")

        invoice.submit_for_review()

        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertIsNone(invoice.reviewed_by)
        self.assertIsNone(invoice.reviewed_at)
        self.assertEqual(invoice.rejection_reason, "")

    def test_states_cannot_be_skipped(self):
        """Draft to approved, and pending to sent, are both refused."""
        invoice = Invoice.objects.create(package=self.package)
        self.assertEqual(invoice.status, Invoice.Status.DRAFT)

        with self.assertRaises(InvalidInvoiceTransition):
            invoice.approve(self.staff)

        invoice.submit_for_review()
        with self.assertRaises(InvalidInvoiceTransition):
            # An invoice awaiting review cannot be sent, document or no
            # document. The state is checked before the argument is looked at.
            invoice.mark_sent("invoices/2026/anything.pdf")

    def test_an_approved_invoice_can_be_sent_and_no_further(self):
        """The transition itself, with a document name standing in for the one
        the render task produces. What actually writes the file is covered in
        InvoiceRenderTests; this is only about the move being legal once."""
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        invoice.mark_sent("invoices/2026/INV-2026-00001-PLSM-0001.pdf")

        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertIsNotNone(invoice.sent_at)
        self.assertTrue(invoice.pdf.name)
        with self.assertRaises(InvalidInvoiceTransition):
            invoice.mark_sent("invoices/2026/a-second-attempt.pdf")


class InvoiceQueueTests(InvoiceTestCase):
    """The list endpoint."""

    def test_the_list_shows_only_what_is_awaiting_review(self):
        pending = self.make_invoice()

        other_package = Package.objects.create(
            user=self.customer, tracking_number="PLSM-0003"
        )
        approved = ensure_invoice_for_package(other_package)
        approved.approve(self.staff)

        self.client.force_authenticate(user=self.staff)
        response = self.client.get(reverse("staff-invoice-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Paginated, like the rest of the dashboard.
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], pending.pk)
        self.assertEqual(
            response.data["results"][0]["tracking_number"], self.package.tracking_number
        )

    def test_the_list_is_closed_to_a_customer(self):
        self.make_invoice()
        self.client.force_authenticate(user=self.customer)

        response = self.client.get(reverse("staff-invoice-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_status_cannot_be_patched_around_the_state_machine(self):
        """There is no update route at all, so a PATCH is refused outright."""
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(
            reverse("staff-invoice-detail", args=[invoice.pk]),
            {"status": Invoice.Status.APPROVED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)


class InvoiceApproveEndpointTests(InvoiceTestCase):
    """POST /api/staff/invoices/<id>/approve/"""

    def test_staff_can_approve(self):
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Invoice.Status.APPROVED)
        # The reviewer is taken from the session, never from the request body.
        self.assertEqual(response.data["reviewed_by"], self.staff.pk)
        self.assertIsNotNone(response.data["reviewed_at"])

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertEqual(invoice.reviewed_by, self.staff)

    def test_approving_twice_is_refused(self):
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)
        self.client.post(self.approve_url(invoice))

        response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_approving_a_rejected_invoice_is_refused(self):
        """Not in PENDING_REVIEW, so the move is not available — and the answer
        is a 409, not a 404: the invoice plainly exists."""
        invoice = self.make_invoice()
        invoice.reject(self.staff, "The declared value is wrong.")
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.REJECTED)

    def test_a_customer_cannot_approve(self):
        """The boundary. A signed-in, perfectly valid customer account calling
        the endpoint directly, with no browser and no React app involved."""
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertIsNone(invoice.reviewed_by)

    def test_an_anonymous_caller_cannot_approve(self):
        invoice = self.make_invoice()

        response = self.client.post(self.approve_url(invoice))

        self.assertIn(
            response.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_a_deactivated_staff_account_cannot_approve(self):
        """is_staff on its own is not enough — IsStaff wants is_active too, so
        suspending an account closes the back office to it immediately."""
        invoice = self.make_invoice()
        self.staff.is_active = False
        self.staff.save()
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class InvoiceRejectEndpointTests(InvoiceTestCase):
    """POST /api/staff/invoices/<id>/reject/"""

    def test_staff_can_reject_with_a_reason(self):
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            self.reject_url(invoice),
            {"rejection_reason": "The declared value does not match the booking."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Invoice.Status.REJECTED)
        self.assertEqual(
            response.data["rejection_reason"],
            "The declared value does not match the booking.",
        )
        self.assertEqual(response.data["reviewed_by"], self.staff.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.REJECTED)

    def test_the_reason_is_required(self):
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)

        missing = self.client.post(self.reject_url(invoice), {}, format="json")
        blank = self.client.post(
            self.reject_url(invoice), {"rejection_reason": "   "}, format="json"
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rejection_reason", missing.data)
        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_rejecting_an_invoice_that_is_not_pending_review_is_refused(self):
        invoice = self.make_invoice()
        invoice.approve(self.staff)
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            self.reject_url(invoice),
            {"rejection_reason": "Changed my mind."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        invoice.refresh_from_db()
        # Still approved, and the reason never landed.
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertEqual(invoice.rejection_reason, "")

    def test_a_customer_cannot_reject(self):
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(
            self.reject_url(invoice),
            {"rejection_reason": "Not my problem."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertEqual(invoice.rejection_reason, "")

    def test_the_customer_who_owns_the_package_still_cannot_reject(self):
        """Owning the shipment is not a reason to be able to review its invoice.
        There is no object-level escape hatch here — IsStaff is checked before
        the object is even looked up."""
        self.assertEqual(self.package.user, self.customer)
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(
            self.reject_url(invoice),
            {"rejection_reason": "I do not want to pay this."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

class InvoiceRenderTests(InvoiceTestCase):
    """Approval produces a document, on a worker, without the reviewer waiting.

    MEDIA_ROOT is redirected at a temporary directory for the whole class, so
    these tests write real files through real storage — the interesting failures
    here are storage failures, and a mocked backend would not have them — and
    leave nothing behind in backend/media.

    CELERY_TASK_ALWAYS_EAGER is already on in the test settings (no broker is
    configured), so .delay() runs the task inline. That makes the task's own
    behaviour testable here; what it does not test is the queueing, which is
    why test_approving_does_not_render_before_the_transaction_commits below
    checks the scheduling separately.
    """

    def setUp(self):
        super().setUp()

        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

    def approve_and_run_tasks(self, invoice, reviewed_by=None):
        """Approve, then run what the approval queued.

        In a TestCase every test runs inside a transaction that is rolled back
        rather than committed, so on_commit callbacks never fire on their own.
        captureOnCommitCallbacks(execute=True) is what stands in for the commit
        the real request would make.
        """
        with self.captureOnCommitCallbacks(execute=True):
            invoice.approve(reviewed_by or self.staff)
        invoice.refresh_from_db()
        return invoice

    def test_approving_renders_the_pdf_and_marks_the_invoice_sent(self):
        """The whole point: approve, and the rest follows without another call."""
        invoice = self.approve_and_run_tasks(self.make_invoice())

        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertIsNotNone(invoice.sent_at)
        self.assertTrue(invoice.pdf.name)

        # A real file, in storage, that is actually a PDF.
        self.assertTrue(os.path.exists(invoice.pdf.path))
        with invoice.pdf.open("rb") as handle:
            self.assertTrue(handle.read(5).startswith(b"%PDF-"))

        # The approval it was raised from survived the two extra writes.
        self.assertEqual(invoice.reviewed_by, self.staff)

    def test_approving_does_not_render_before_the_transaction_commits(self):
        """The race on_commit exists to prevent.

        Queued inside the transaction, the worker can read the row before the
        approval lands, see PENDING_REVIEW and decline. Here the callback is
        captured but deliberately not executed, which is the state of the world
        for as long as the transaction is open: approved, nothing rendered yet.
        """
        invoice = self.make_invoice()

        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            invoice.approve(self.staff)

            invoice.refresh_from_db()
            self.assertEqual(invoice.status, Invoice.Status.APPROVED)
            self.assertEqual(invoice.pdf.name, "")

        # Exactly one job was queued, and only the commit would have run it.
        self.assertEqual(len(callbacks), 1)

    def test_rejecting_queues_nothing(self):
        invoice = self.make_invoice()

        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            invoice.reject(self.staff, "The declared value is wrong.")

        self.assertEqual(callbacks, [])

    def test_the_task_is_safe_to_run_twice(self):
        """acks_late puts a half-finished job back on the queue, so a second run
        is normal, not exceptional. It must not produce a second document."""
        invoice = self.approve_and_run_tasks(self.make_invoice())
        first_name = invoice.pdf.name
        first_sent_at = invoice.sent_at

        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        # Same file, same timestamp: the second run saw SENT and stopped.
        self.assertEqual(invoice.pdf.name, first_name)
        self.assertEqual(invoice.sent_at, first_sent_at)
        self.assertEqual(len(os.listdir(os.path.dirname(invoice.pdf.path))), 1)

    def test_the_task_declines_an_invoice_that_is_not_approved(self):
        """A stale job for an invoice that has since moved on does nothing,
        rather than rendering a document for an invoice under review."""
        invoice = self.make_invoice()

        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertEqual(invoice.pdf.name, "")

    def test_the_task_survives_an_invoice_that_no_longer_exists(self):
        """The package was deleted between approval and the worker picking it
        up. Nothing to do, and not an error."""
        invoice = self.make_invoice()
        invoice_id = invoice.pk
        self.package.delete()

        render_approved_invoice(invoice_id)  # must not raise

        self.assertFalse(Invoice.objects.filter(pk=invoice_id).exists())

    def test_a_failed_render_leaves_the_invoice_approved_not_sent(self):
        """The half-finished state has to be the recoverable one.

        An invoice still showing APPROVED can be re-queued. One showing SENT
        with no document cannot be told apart from one that really was sent.

        Note what does not happen: the render blows up and the approval stands
        anyway. On a real worker that is simply where the two live — different
        process, different transaction. Inline, it is what
        CELERY_TASK_EAGER_PROPAGATES = False buys: the failure is logged by the
        task machinery instead of surfacing in the caller, so a broken renderer
        cannot take down approving in development either.
        """
        invoice = self.make_invoice()

        with mock.patch(
            "invoicing.tasks.render_invoice_pdf", side_effect=ValueError("boom")
        ):
            with self.captureOnCommitCallbacks(execute=True):
                invoice.approve(self.staff)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertEqual(invoice.pdf.name, "")
        self.assertIsNone(invoice.sent_at)
        # Nothing was written under MEDIA_ROOT either.
        self.assertFalse(os.path.exists(os.path.join(self.media_root, "invoices")))

    def test_a_worker_that_loses_the_race_cleans_up_its_file(self):
        """Two workers, one invoice. The loser's mark_sent is refused by the
        conditional UPDATE, and the file it wrote must not be left orphaned."""
        invoice = self.approve_and_run_tasks(self.make_invoice())
        directory = os.path.dirname(invoice.pdf.path)

        # A second worker still holding an APPROVED copy of the row, which is
        # what one would have read a moment before the winner's UPDATE landed.
        stale = Invoice.objects.select_related("package", "package__user").get(
            pk=invoice.pk
        )
        stale.status = Invoice.Status.APPROVED

        with mock.patch("invoicing.tasks.Invoice.objects.select_related") as lookup:
            lookup.return_value.filter.return_value.first.return_value = stale
            render_approved_invoice(invoice.pk)

        # Its file is gone; only the document actually on the invoice remains.
        self.assertEqual(os.listdir(directory), [os.path.basename(invoice.pdf.name)])
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.SENT)

    def test_a_broker_that_is_down_does_not_fail_the_approval(self):
        """The reviewer's decision must not depend on the queue being up.

        .delay() runs from an on_commit hook, so an exception there lands in the
        request after the approval has already committed — a 500 for a reviewer
        whose approval succeeded, telling them to retry something that is no
        longer retryable. It is caught instead, and the invoice is left in the
        recoverable APPROVED state.
        """
        invoice = self.make_invoice()

        with mock.patch(
            "invoicing.tasks.render_approved_invoice.delay",
            side_effect=OSError("no broker"),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                invoice.approve(self.staff)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)
        self.assertEqual(invoice.reviewed_by, self.staff)
        self.assertEqual(invoice.pdf.name, "")

        # And re-queueing later finishes the job, with no second approval.
        render_approved_invoice(invoice.pk)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.SENT)
        self.assertTrue(invoice.pdf.name)

    def test_an_invoice_cannot_be_marked_sent_without_a_document(self):
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        with self.assertRaises(InvalidInvoiceTransition):
            invoice.mark_sent("")

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)

    def test_the_database_refuses_a_sent_invoice_with_no_document(self):
        """The backstop under mark_sent, for a bulk update that goes around it."""
        invoice = self.approve_and_run_tasks(self.make_invoice())

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Invoice.objects.filter(pk=invoice.pk).update(pdf="")

    def test_approving_over_the_api_answers_approved_and_queues_the_render(self):
        """What the reviewer sees. The response is the approval, not the send —
        the document is still being drawn when it arrives."""
        invoice = self.make_invoice()
        self.client.force_authenticate(user=self.staff)

        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.client.post(self.approve_url(invoice))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Invoice.Status.APPROVED)
        self.assertIsNone(response.data["pdf_url"])
        self.assertEqual(len(callbacks), 1)

    def test_the_queue_exposes_the_document_once_it_is_sent(self):
        invoice = self.approve_and_run_tasks(self.make_invoice())
        self.client.force_authenticate(user=self.staff)

        response = self.client.get(reverse("staff-invoice-detail", args=[invoice.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Invoice.Status.SENT)
        self.assertTrue(response.data["pdf_url"].endswith(".pdf"))


class InvoicePdfTests(InvoiceTestCase):
    """The drawing itself, with no storage and no task in the way."""

    def test_it_renders_a_pdf_carrying_the_invoice_number(self):
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        content = render_invoice_pdf(invoice)

        self.assertTrue(content.startswith(b"%PDF-"))
        # The number is set as the document title, which lands in the file.
        self.assertIn(invoice_number(invoice).encode(), content)

    def test_the_invoice_number_is_stable(self):
        invoice = self.make_invoice()

        self.assertEqual(invoice_number(invoice), invoice_number(invoice))
        self.assertRegex(invoice_number(invoice), r"^INV-\d{4}-\d{5}$")

    def test_it_renders_a_package_with_nothing_filled_in(self):
        """value_eur, weight and description are all optional on Package, and a
        missing figure must produce a document with a dash in it rather than an
        exception on the worker."""
        bare = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0003",
            status=Package.Status.PAID,
        )
        invoice = ensure_invoice_for_package(bare)
        invoice.approve(self.staff)

        self.assertTrue(render_invoice_pdf(invoice).startswith(b"%PDF-"))
