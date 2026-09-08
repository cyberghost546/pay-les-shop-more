"""Reconstruct what history the existing rows can honestly support.

This is a partial backfill and cannot be anything else. Package keeps a status
and two timestamps, so of the seven statuses only in_transit and delivered say
when they happened; a package that went quoted -> paid -> purchased left no
trace of when. Invoice keeps one verdict, and submit_for_review() erased it
every time a rejected invoice came back, so an invoice rejected twice and then
approved can only be backfilled as approved.

Everything recoverable is written and nothing is invented. In particular no
event is dated by guesswork: if there is no stored timestamp for a thing, the
thing does not appear, because a timeline with plausible fabricated dates on it
is worse than one with gaps — gaps are visibly gaps.

Every row written here carries backfilled=True in its context, which is what
makes the reverse honest as well: it removes exactly what this added and leaves
anything recorded live since.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    Package = apps.get_model("accounts", "Package")
    PackageEvent = apps.get_model("accounts", "PackageEvent")
    Invoice = apps.get_model("invoicing", "Invoice")

    events = []

    def add(package_id, kind, at, actor_id=None, **context):
        context["backfilled"] = True
        events.append(
            PackageEvent(
                package_id=package_id,
                kind=kind,
                at=at,
                actor_id=actor_id,
                context={k: v for k, v in context.items() if v is not None},
            )
        )

    # --- shipping. Only the two moments that were ever written down.
    for package in Package.objects.all().only(
        "id", "status", "shipped_at", "delivered_at"
    ):
        if package.shipped_at:
            add(package.id, "status_changed", package.shipped_at, to_status="in_transit")
        if package.delivered_at:
            add(package.id, "status_changed", package.delivered_at, to_status="delivered")

    # --- billing.
    for invoice in Invoice.objects.all().only(
        "id", "package_id", "status", "created_at", "reviewed_at",
        "reviewed_by_id", "rejection_reason", "sent_at",
    ):
        add(invoice.package_id, "invoice_raised", invoice.created_at, invoice_id=invoice.id)

        # A sent invoice was approved first, and Invoice's own constraints
        # guarantee reviewed_by is set for approved, sent and rejected alike —
        # which is what lets the verdict rows satisfy the actor constraint.
        if invoice.status in ("approved", "sent") and invoice.reviewed_at:
            add(
                invoice.package_id,
                "invoice_approved",
                invoice.reviewed_at,
                actor_id=invoice.reviewed_by_id,
                invoice_id=invoice.id,
            )

        if invoice.status == "rejected" and invoice.reviewed_at:
            add(
                invoice.package_id,
                "invoice_rejected",
                invoice.reviewed_at,
                actor_id=invoice.reviewed_by_id,
                reason=invoice.rejection_reason or None,
                invoice_id=invoice.id,
            )

        if invoice.status == "sent" and invoice.sent_at:
            add(invoice.package_id, "invoice_sent", invoice.sent_at, invoice_id=invoice.id)

    # Sorted before writing so the primary keys run in the same direction as
    # the timestamps. Meta.ordering breaks ties on id, and rows inserted in a
    # scrambled order would make two events sharing a timestamp read backwards.
    events.sort(key=lambda event: event.at)
    PackageEvent.objects.bulk_create(events, batch_size=500)


def unbackfill(apps, schema_editor):
    PackageEvent = apps.get_model("accounts", "PackageEvent")
    PackageEvent.objects.filter(context__backfilled=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_packageevent"),
        # The backfill reads invoices, so their table has to exist first.
        ("invoicing", "0002_invoice_pdf_invoice_invoice_sent_needs_pdf"),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
