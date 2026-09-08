"""Re-queue the render for invoices that were approved but never rendered.

    python manage.py rerender_invoices              # everything stuck
    python manage.py rerender_invoices --dry-run    # list it, queue nothing
    python manage.py rerender_invoices --invoice 42 # just this one
    python manage.py rerender_invoices --limit 10   # the oldest ten

An invoice approved while the broker was down stays APPROVED with no document:
Invoice._queue_render catches the failure so that a dead broker cannot turn a
reviewer's successful approval into a 500. That is the right trade — the
decision is the part worth keeping — but it leaves a row nobody is coming back
for, and until this command existed the staff dashboard's `awaiting_document`
count was a number with nothing behind it.

A failed render leaves exactly the same state, which is deliberate: the invoice
stays in the one condition that can be told apart from a real send and safely
retried. This is the retry.

Safe to run as often as you like. render_approved_invoice re-reads the row and
declines anything that is no longer APPROVED, and mark_sent is a conditional
UPDATE, so a job queued here that races a worker already holding the same
invoice loses cleanly and cleans up its own file.

With no CELERY_BROKER_URL set, CELERY_TASK_ALWAYS_EAGER means .delay() runs the
render inline instead of handing it to a worker. The command then does the work
itself and takes correspondingly longer, which in development is usually what
you want.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from invoicing.models import Invoice
from invoicing.tasks import render_approved_invoice

# An invoice approved a moment ago most likely has a worker on it already.
# Re-queueing would not corrupt anything — the task is safe to run twice — but
# it would be noise, and the ones actually worth rescuing are never fresh.
# --min-age 0 turns this off for the case where you know the broker was down.
DEFAULT_MIN_AGE_MINUTES = 5


class Command(BaseCommand):
    help = "Re-queue the PDF render for invoices approved but never rendered."

    def add_arguments(self, parser):
        parser.add_argument(
            "--invoice",
            type=int,
            metavar="ID",
            help=(
                "Re-queue one invoice by id, ignoring the age cutoff. Fails if "
                "that invoice is not actually awaiting a document."
            ),
        )
        parser.add_argument(
            "--min-age",
            type=int,
            default=DEFAULT_MIN_AGE_MINUTES,
            metavar="MINUTES",
            help=(
                "Only invoices approved at least this many minutes ago "
                f"(default: {DEFAULT_MIN_AGE_MINUTES}). Use 0 for all of them."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            metavar="N",
            help="Re-queue at most N invoices, oldest approval first.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be re-queued without queueing anything.",
        )

    def handle(self, *args, **options):
        invoices = self.select(options)

        if not invoices:
            self.stdout.write("No invoices are awaiting a document.")
            return

        if options["dry_run"]:
            self.stdout.write(
                f"{len(invoices)} invoice(s) would be re-queued:"
            )
            for invoice in invoices:
                self.stdout.write(f"  {self.describe(invoice)}")
            return

        queued, failed = self.queue(invoices)

        if queued:
            self.stdout.write(self.style.SUCCESS(f"Re-queued {queued} invoice(s)."))

        # Raised rather than printed: a broker that is still down should make
        # this command exit non-zero, so a cron or a deploy step calling it
        # finds out instead of logging a success it did not have.
        if failed:
            raise CommandError(
                f"{failed} invoice(s) could not be queued. The broker is "
                "probably still unreachable; the invoices are unchanged and "
                "this command can be run again."
            )

    def select(self, options):
        """The invoices to act on, oldest approval first.

        `pdf=""` rather than a null check: the field is blank-not-null, so an
        unrendered invoice holds an empty string. This is the same filter the
        staff dashboard counts as `awaiting_document`, deliberately — the
        number staff are shown and the set this command fixes have to be the
        same set, or the count never reaches zero.
        """
        stuck = Invoice.objects.filter(
            status=Invoice.Status.APPROVED, pdf=""
        ).select_related("package")

        if options["invoice"] is not None:
            invoice = stuck.filter(pk=options["invoice"]).first()
            if invoice is None:
                # Deliberately not silent. Naming one invoice is a specific
                # claim about it, and being told nothing happened is more
                # useful than a clean exit that did nothing.
                raise CommandError(
                    f"Invoice {options['invoice']} is not awaiting a document. "
                    "It may not exist, or it may already have been sent."
                )
            return [invoice]

        if options["min_age"] < 0:
            raise CommandError("--min-age cannot be negative.")

        if options["min_age"]:
            cutoff = timezone.now() - timedelta(minutes=options["min_age"])
            stuck = stuck.filter(reviewed_at__lte=cutoff)

        # Oldest first, so a --limit run rescues the invoices that have been
        # waiting longest rather than an arbitrary handful.
        stuck = stuck.order_by("reviewed_at")

        if options["limit"] is not None:
            if options["limit"] < 1:
                raise CommandError("--limit must be at least 1.")
            stuck = stuck[: options["limit"]]

        return list(stuck)

    def queue(self, invoices):
        """Hand each invoice to a worker, and keep going if one will not go.

        Caught per invoice rather than around the loop: one unreachable broker
        fails everything, but one invoice that trips over something of its own
        should not stop the other forty from being rescued.
        """
        queued = 0
        failed = 0

        for invoice in invoices:
            try:
                render_approved_invoice.delay(invoice.pk)
            except Exception as error:
                failed += 1
                self.stderr.write(
                    self.style.ERROR(f"  {self.describe(invoice)}: {error}")
                )
            else:
                queued += 1
                self.stdout.write(f"  queued {self.describe(invoice)}")

        return queued, failed

    def describe(self, invoice):
        approved = (
            timezone.localtime(invoice.reviewed_at).strftime("%Y-%m-%d %H:%M")
            if invoice.reviewed_at
            else "unknown"
        )
        return (
            f"invoice {invoice.pk} "
            f"({invoice.package.tracking_number}, approved {approved})"
        )
