"""Turning a released intake sheet into the e-mail that lands on a desk.

Plain text, and the whole sheet rather than a link to it. That is the opposite
of the choice notifications/messages.py makes for customers, and deliberately:
a customer's e-mail is a nudge towards a page they are already signed in to,
while this one is read on a phone in a warehouse by somebody who needs the
colli count before they have found a laptop. The link is there too, at the
bottom, for the half of the job that needs the dashboard.

English, like every other e-mail the system sends, with the Dutch words from
the paper form kept where they are what people actually say - Ophalen,
Palletdoos, colli. Somebody comparing the mail against the clipboard should be
able to read down both at once.

Kept apart from tasks.py so that what a message says can be tested without an
outbox, and apart from models.py so that a wording change is not a migration.
"""

from django.conf import settings

from .models import IntakeSheet

# What a Ja / Nee box reads as when nobody ticked it. Said out loud rather
# than left blank: a silent gap in a damage report looks like "no damage".
NOT_CHECKED = "not checked"

CHECK_WORDS = {
    IntakeSheet.Check.YES: "Ja",
    IntakeSheet.Check.NO: "Nee",
    "": NOT_CHECKED,
}


def _yes_no(value):
    return "Ja" if value else "Nee"


def _check(value):
    return CHECK_WORDS.get(value, NOT_CHECKED)


def _blank(value):
    """A dash for anything the sheet leaves empty.

    An empty line after a label reads as a rendering fault; a dash reads as a
    person who had nothing to write there.
    """
    text = "" if value is None else str(value).strip()
    return text or "-"


def _packaging(sheet):
    """Verpakking, with the write-in line folded into it."""
    if sheet.packaging == IntakeSheet.Packaging.OTHER:
        return _blank(sheet.packaging_other)

    return sheet.get_packaging_display() if sheet.packaging else "-"


def subject_for(sheet):
    """The subject line.

    Leads with the word that makes it findable in a full inbox, then the
    sheet's own name, then where it is going - which is how somebody decides
    whether this one is theirs without opening it.
    """
    # A correction has to be findable as one in a list of subject lines,
    # which is why this leads rather than trails: somebody scanning an inbox
    # reads the first few words of each line and nothing else.
    lead = "Intake sheet" if sheet.revision <= 1 else "CORRECTED intake sheet"

    parts = [f"{lead} {sheet.label}"]

    destination = sheet.destination.strip()
    if destination:
        parts.append(destination)

    return " - ".join(parts)


def body_for(sheet):
    """The plain-text body: the whole sheet, in the order of the paper form.

    Read top to bottom it is the clipboard. The one thing added is the line
    about damage, which is repeated near the top when there is any, because a
    damaged consignment changes what the reader does before they have got as
    far as the checks.
    """
    released_by = ""
    if sheet.released_by is not None:
        released_by = sheet.released_by.get_full_name() or sheet.released_by.email

    signed = sheet.employee_name.strip() or released_by

    if sheet.revision <= 1:
        lines = [
            f"Intake sheet {sheet.label} has been released by the warehouse.",
            "",
        ]
    else:
        # Said twice - the opening line and the version number - because these
        # get printed and carried around, and a sheet on a desk has to be
        # checkable against one in an inbox.
        lines = [
            f"Intake sheet {sheet.label} has been CORRECTED by the warehouse.",
            "",
            f"This is version {sheet.revision} and it replaces the copy sent "
            "earlier. Work from this one.",
            "",
        ]

    if sheet.damage_present == IntakeSheet.Check.YES:
        lines += [
            "This consignment was received DAMAGED. See the checks below.",
            "",
        ]

    lines += [
        "Collection",
        f"  Ophalen: {_yes_no(sheet.pickup)}",
        f"  Verdieping: {_yes_no(sheet.upper_floor)}",
        f"  Werknemers: {_blank(sheet.employees)}",
        f"  Plaats van ophalen: {_blank(sheet.pickup_location)}",
        f"  Datum aanname goederen: {_blank(sheet.received_on)}",
        "",
        "Packing",
        f"  Inpakken: {_yes_no(sheet.packing_required)}",
        f"  Palletdoos: {_yes_no(sheet.pallet_box)}",
        f"  Aantal kuub: {_blank(sheet.volume_m3)} m3",
        "",
        "Checks",
        f"  Goed ingepakt: {_check(sheet.packed_well)}",
        f"  Schade aanwezig: {_check(sheet.damage_present)}",
        f"  Adreslabel aanwezig: {_check(sheet.address_label_present)}",
        f"  Opmerkingen: {_blank(sheet.check_notes)}",
        "",
        "Consignment",
        f"  Leverancier: {_blank(sheet.supplier)}",
        f"  Afzender: {_blank(sheet.sender)}",
        f"  Bestemming: {_blank(sheet.destination)}",
        f"  Ontvanger: {_blank(sheet.recipient)}",
        f"  Opmerkingen: {_blank(sheet.notes)}",
        "",
        "Goods",
        f"  Aantal colli: {_blank(sheet.colli_count)}",
        f"  Verpakking: {_packaging(sheet)}",
        f"  Afmetingen & gewicht: {_blank(sheet.dimensions_weight)}",
        (
            "  Transportwijze: "
            f"{sheet.get_freight_display() if sheet.freight else '-'}"
        ),
        "",
        f"Naam werknemer: {_blank(signed)}",
    ]

    if sheet.booking_id:
        lines.append(f"Booking on file: #{sheet.booking_id}")
    if sheet.package_id:
        lines.append(f"Shipment on file: #{sheet.package_id}")

    lines += [
        "",
        "Open it in the dashboard to work on it:",
        f"{settings.FRONTEND_URL}/dashboard/intake?sheet={sheet.pk}",
        "",
        "PayLesShopMore.com",
    ]

    return "\n".join(lines)
