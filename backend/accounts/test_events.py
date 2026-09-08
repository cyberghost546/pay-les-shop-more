"""Tests for the order history.

The point of this table is that it remembers things the rest of the schema
throws away, so most of what is worth asserting here is that a fact survives
the operation that used to destroy it. The rejection tests are the ones that
matter: submit_for_review() clears reviewed_by, reviewed_at and
rejection_reason on every resubmission, and before this table an invoice
rejected twice and then approved was indistinguishable from one approved
first time.
"""

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from accounts.events import record_event, timeline_for
from accounts.models import Package, PackageEvent
from invoicing.models import InvalidInvoiceTransition, Invoice
from invoicing.services import ensure_invoice_for_package

User = get_user_model()


class EventTestCase(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username="agent@example.com",
            email="agent@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.other_staff = User.objects.create_user(
            username="agent2@example.com",
            email="agent2@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
        )
        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-0001",
            description="Twee dozen",
            status=Package.Status.PAID,
            value_eur="149.95",
        )

    def kinds(self):
        return list(timeline_for(self.package).values_list("kind", flat=True))


class AppendOnlyTests(EventTestCase):
    def test_an_event_cannot_be_edited(self):
        """The whole value of the table is that a row still means what it said
        when it was written."""
        event = record_event(
            self.package, PackageEvent.Kind.STATUS_CHANGED, to_status="paid"
        )

        event.context = {"to_status": "delivered"}
        with self.assertRaises(ValueError):
            event.save()

        event.refresh_from_db()
        self.assertEqual(event.context["to_status"], "paid")

    def test_a_verdict_without_an_actor_is_refused_by_the_database(self):
        """An approval with no approver is the exact hole this table closes, so
        the database refuses it rather than trusting the helper."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PackageEvent.objects.create(
                    package=self.package,
                    kind=PackageEvent.Kind.INVOICE_APPROVED,
                    actor=None,
                )

    def test_recording_never_raises(self):
        """Called from inside the transaction that approves an invoice. Losing
        the record is bad; refusing the approval because the record failed is
        worse."""
        # No package: the one argument that cannot produce a valid row.
        self.assertIsNone(
            record_event(None, PackageEvent.Kind.STATUS_CHANGED, to_status="paid")
        )

    def test_a_failing_write_does_not_take_the_caller_down(self):
        """The case the swallow actually exists for: the table itself refuses
        the row. The approval that was being recorded has to survive it."""
        with mock.patch.object(
            PackageEvent.objects, "create", side_effect=OSError("disk gone")
        ):
            result = record_event(
                self.package, PackageEvent.Kind.STATUS_CHANGED, to_status="paid"
            )

        self.assertIsNone(result)
        self.assertEqual(timeline_for(self.package).count(), 0)


class InvoiceHistoryTests(EventTestCase):
    def make_invoice(self):
        return ensure_invoice_for_package(self.package)

    def test_raising_an_invoice_is_recorded_once(self):
        """DRAFT -> PENDING_REVIEW happens inside ensure_invoice_for_package.
        It is one thing happening and belongs on the timeline once."""
        self.make_invoice()
        self.assertEqual(self.kinds(), [PackageEvent.Kind.INVOICE_RAISED])

    def test_approving_records_who_approved_it(self):
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        approval = timeline_for(self.package).get(
            kind=PackageEvent.Kind.INVOICE_APPROVED
        )
        self.assertEqual(approval.actor, self.staff)

    def test_a_rejection_and_its_reason_survive_the_correction(self):
        """The headline. submit_for_review() wipes rejection_reason off the
        invoice; the history is what still knows what was wrong."""
        invoice = self.make_invoice()
        invoice.reject(self.staff, "The declared value is wrong.")
        invoice.submit_for_review()

        # Gone from the invoice, exactly as the state machine intends.
        invoice.refresh_from_db()
        self.assertEqual(invoice.rejection_reason, "")
        self.assertIsNone(invoice.reviewed_by)

        # Still on the record.
        rejection = timeline_for(self.package).get(
            kind=PackageEvent.Kind.INVOICE_REJECTED
        )
        self.assertEqual(rejection.actor, self.staff)
        self.assertEqual(rejection.context["reason"], "The declared value is wrong.")

    def test_every_rejection_survives_not_only_the_last(self):
        """Two reviewers, two rejections, then an approval. Before this table
        the invoice showed only the approval."""
        invoice = self.make_invoice()

        invoice.reject(self.staff, "The declared value is wrong.")
        invoice.submit_for_review()
        invoice.reject(self.other_staff, "The weight does not match the manifest.")
        invoice.submit_for_review()
        invoice.approve(self.staff)

        self.assertEqual(
            self.kinds(),
            [
                PackageEvent.Kind.INVOICE_RAISED,
                PackageEvent.Kind.INVOICE_REJECTED,
                PackageEvent.Kind.INVOICE_RESUBMITTED,
                PackageEvent.Kind.INVOICE_REJECTED,
                PackageEvent.Kind.INVOICE_RESUBMITTED,
                PackageEvent.Kind.INVOICE_APPROVED,
            ],
        )

        rejections = timeline_for(self.package).filter(
            kind=PackageEvent.Kind.INVOICE_REJECTED
        )
        self.assertEqual([r.actor for r in rejections], [self.staff, self.other_staff])
        self.assertEqual(
            [r.context["reason"] for r in rejections],
            [
                "The declared value is wrong.",
                "The weight does not match the manifest.",
            ],
        )

    def test_sending_is_recorded_with_no_actor(self):
        """A worker finishing a render is the system completing a job, not a
        person deciding something."""
        invoice = self.make_invoice()
        invoice.approve(self.staff)
        invoice.mark_sent("invoices/2026/INV-2026-00001-PLSM-0001.pdf")

        sent = timeline_for(self.package).get(kind=PackageEvent.Kind.INVOICE_SENT)
        self.assertIsNone(sent.actor)

    def test_a_refused_transition_records_nothing(self):
        """Only the winner of the conditional UPDATE gets to write history."""
        invoice = self.make_invoice()
        invoice.approve(self.staff)

        stale = Invoice.objects.get(pk=invoice.pk)
        stale.status = Invoice.Status.PENDING_REVIEW  # a stale in-memory copy

        with self.assertRaises(InvalidInvoiceTransition):
            stale.approve(self.other_staff)

        approvals = timeline_for(self.package).filter(
            kind=PackageEvent.Kind.INVOICE_APPROVED
        )
        self.assertEqual(approvals.count(), 1)
        self.assertEqual(approvals.first().actor, self.staff)


class TimelineOrderingTests(EventTestCase):
    def test_events_come_back_oldest_first(self):
        """Written out of order on purpose: a timeline is sorted by when things
        happened, not by when somebody got round to recording them."""
        now = timezone.now()

        later = record_event(
            self.package,
            PackageEvent.Kind.STATUS_CHANGED,
            at=now + timedelta(hours=1),
            to_status="delivered",
        )
        earlier = record_event(
            self.package,
            PackageEvent.Kind.STATUS_CHANGED,
            at=now,
            to_status="in_transit",
        )

        self.assertEqual(list(timeline_for(self.package)), [earlier, later])
