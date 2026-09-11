"""Turning a code read off a box into something to work on.

One function. It is kept out of views.py because the interesting part is not
the HTTP - it is the order the three tables are asked in, and that order is a
decision about what somebody standing in front of a pallet most likely means.

What the scanner reads is whatever is printed on the package: a carrier label,
a shipping number written on with a marker, the reference off a booking
confirmation. There is no one format, which is why nothing here parses the
code. It is looked up, whole, in the places it might be a key to.
"""

from accounts.models import Package
from bookings.models import Booking

from .models import IntakeSheet


def find(code):
    """What a scanned code points at.

    Returns a dict with `match` naming what was found:

        sheet      an intake sheet already exists for this code - open it
        package    a shipment on file, with no sheet yet - start one
        booking    a booking form on file, with no sheet yet - start one
        none       nothing recognised it - start a blank sheet under this code

    The order matters and is not alphabetical. A sheet wins over the shipment
    it belongs to, because somebody scanning a box they have already written up
    means "show me what I wrote", not "start again" - and a second sheet for
    the same goods is the failure this whole lookup exists to prevent.

    `none` is an answer rather than an error. Goods turn up at a warehouse
    with a supplier's own barcode on them and nothing else, and a scanner that
    refuses those sends people back to typing.

    Nothing here writes. A mis-scan - a barcode from the shelf behind, a label
    on the wrong side of the box - must cost a second scan and not a junk row
    that somebody has to find and explain later.
    """
    code = (code or "").strip()

    if not code:
        return {"code": "", "match": "none", "sheet": None, "package": None, "booking": None}

    found = {"code": code, "match": "none", "sheet": None, "package": None, "booking": None}

    # iexact throughout: a code read off a label arrives in whatever case it
    # was printed in, and "ci-1001" and "CI-1001" are the same package.
    sheet = (
        IntakeSheet.objects.select_related("created_by", "released_by")
        .filter(reference__iexact=code)
        .order_by("-created_at")
        .first()
    )
    if sheet is not None:
        found["match"] = "sheet"
        found["sheet"] = sheet
        return found

    package = (
        Package.objects.select_related("user")
        .filter(tracking_number__iexact=code)
        .first()
    )
    if package is not None:
        # A sheet may already be filed against the shipment under a different
        # reference - written up from the booking rather than the box. That is
        # still the sheet for these goods, so it wins here too.
        existing = package.intake_sheets.order_by("-created_at").first()

        if existing is not None:
            found["match"] = "sheet"
            found["sheet"] = existing
        else:
            found["match"] = "package"
            found["package"] = package

        return found

    booking = Booking.objects.filter(shipping_number__iexact=code).first()
    if booking is not None:
        existing = booking.intake_sheets.order_by("-created_at").first()

        if existing is not None:
            found["match"] = "sheet"
            found["sheet"] = existing
        else:
            found["match"] = "booking"
            found["booking"] = booking

        return found

    return found
