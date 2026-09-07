"""Drawing an invoice as a PDF.

Split out from tasks.py because the two things fail for different reasons and
are worth testing apart: this module turns an Invoice into bytes and touches
neither the database nor the filesystem, so a test can call it and read the
result without a broker, a worker or a media directory anywhere in the loop.

ReportLab's low-level canvas rather than Platypus: the document is one page of
fixed furniture with a short table in the middle, so a flowable engine would be
machinery for a layout that never reflows.
"""

from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# A4 in points, and one margin used on all four sides.
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 20 * mm

# The two type sizes and the line spacing everything below is built from.
BODY_SIZE = 10
HEADING_SIZE = 16
LINE = 5.5 * mm


def invoice_number(invoice):
    """The human-facing reference, stable for the life of the invoice.

    Built from the year it was raised and its primary key, zero-padded, so it
    reads as a document number rather than as a database id. The id is already
    unique, so no sequence of its own is needed.
    """
    return f"INV-{timezone.localtime(invoice.created_at):%Y}-{invoice.pk:05d}"


def _money(amount):
    """Format a Decimal as euros, or a dash when there is no figure."""
    if amount is None:
        return "—"
    return f"EUR {Decimal(amount):,.2f}"


def _billing_lines(package):
    """Who the invoice is addressed to, as the lines of an address block.

    Prefers delivery_address_text, the snapshot frozen when the package
    shipped, over the live Address row: the invoice records where the shipment
    actually went, and must not change later because the customer edited or
    deleted that address. An anonymised customer leaves the name as whatever
    str(User) gives back, which is already the redacted form.
    """
    lines = [str(package.user)]

    if package.delivery_address_text.strip():
        lines += [
            line.strip()
            for line in package.delivery_address_text.splitlines()
            if line.strip()
        ]
    elif package.delivery_address_id and package.delivery_address:
        address = package.delivery_address
        lines += [
            f"{address.street} {address.house_number}".strip(),
            " ".join(part for part in (address.postal_code, address.city) if part),
            address.get_country_display(),
        ]

    return [line for line in lines if line]


def render_invoice_pdf(invoice):
    """Return the invoice as PDF bytes.

    Reads `invoice.package` and `invoice.package.user`, so the caller should
    have select_related them if it cares about query count.
    """
    package = invoice.package

    from io import BytesIO

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"Invoice {invoice_number(invoice)}")
    # Shown in a reader's document properties, and the closest thing a PDF has
    # to a "who made this".
    pdf.setAuthor(settings.DEFAULT_FROM_EMAIL)

    top = PAGE_HEIGHT - MARGIN
    right = PAGE_WIDTH - MARGIN

    # ---- header ---------------------------------------------------------
    pdf.setFont("Helvetica-Bold", HEADING_SIZE)
    pdf.drawString(MARGIN, top, "PayLesShopMore.com")

    pdf.setFont("Helvetica-Bold", HEADING_SIZE)
    pdf.drawRightString(right, top, "INVOICE")

    pdf.setFont("Helvetica", BODY_SIZE)
    cursor = top - LINE * 1.6
    pdf.drawRightString(right, cursor, invoice_number(invoice))
    cursor -= LINE
    pdf.drawRightString(
        right,
        cursor,
        f"Date: {timezone.localtime(invoice.reviewed_at or invoice.created_at):%d %B %Y}",
    )
    cursor -= LINE
    pdf.drawRightString(right, cursor, f"Tracking: {package.tracking_number}")

    # A rule under the header, level with the lowest line of either column.
    rule_y = cursor - LINE
    pdf.setLineWidth(0.75)
    pdf.line(MARGIN, rule_y, right, rule_y)

    # ---- bill to --------------------------------------------------------
    cursor = rule_y - LINE * 1.8
    pdf.setFont("Helvetica-Bold", BODY_SIZE)
    pdf.drawString(MARGIN, cursor, "Bill to")

    pdf.setFont("Helvetica", BODY_SIZE)
    for line in _billing_lines(package):
        cursor -= LINE
        pdf.drawString(MARGIN, cursor, line)

    # ---- the shipment ---------------------------------------------------
    cursor -= LINE * 2.4
    pdf.setFont("Helvetica-Bold", BODY_SIZE)
    pdf.drawString(MARGIN, cursor, "Description")
    pdf.drawRightString(right, cursor, "Amount")

    cursor -= LINE * 0.6
    pdf.setLineWidth(0.5)
    pdf.line(MARGIN, cursor, right, cursor)

    cursor -= LINE * 1.4
    pdf.setFont("Helvetica", BODY_SIZE)
    description = package.description.strip() or "Shipping and handling"
    # One line only: the column is not wide enough to wrap into, and a truncated
    # description is better than one that runs under the amount.
    if len(description) > 60:
        description = description[:57] + "..."
    pdf.drawString(MARGIN, cursor, description)
    pdf.drawRightString(right, cursor, _money(package.value_eur))

    if package.weight_kg is not None:
        cursor -= LINE
        pdf.setFont("Helvetica", BODY_SIZE - 1)
        pdf.drawString(MARGIN, cursor, f"Weight: {package.weight_kg} kg")
        pdf.setFont("Helvetica", BODY_SIZE)

    if package.destination_label:
        cursor -= LINE
        pdf.setFont("Helvetica", BODY_SIZE - 1)
        pdf.drawString(MARGIN, cursor, f"Destination: {package.destination_label}")
        pdf.setFont("Helvetica", BODY_SIZE)

    # ---- total ----------------------------------------------------------
    cursor -= LINE * 1.4
    pdf.setLineWidth(0.5)
    pdf.line(MARGIN, cursor, right, cursor)

    cursor -= LINE * 1.4
    pdf.setFont("Helvetica-Bold", BODY_SIZE + 1)
    pdf.drawString(MARGIN, cursor, "Total")
    pdf.drawRightString(right, cursor, _money(package.value_eur))

    # ---- footer ---------------------------------------------------------
    # Who approved it and when, on the document itself. The same fact the model
    # keeps as an audit trail, printed where the customer can see it.
    pdf.setFont("Helvetica", BODY_SIZE - 2)
    footer = MARGIN + LINE
    if invoice.reviewed_by_id and invoice.reviewed_at:
        pdf.drawString(
            MARGIN,
            footer,
            f"Approved by {invoice.reviewed_by} on "
            f"{timezone.localtime(invoice.reviewed_at):%d %B %Y %H:%M}",
        )
    pdf.drawRightString(right, footer, "PayLesShopMore.com")

    pdf.showPage()
    pdf.save()

    return buffer.getvalue()
