"""Turning a domain refusal into an HTTP answer, in one place.

Package.save() enforces the shipment lock, because that is the only layer
every write path goes through — the dashboard, the customer API, the admin, a
management command, the shell. The cost of putting the rule that low is that
it raises a plain Python exception, and a plain exception reaching DRF is a
500: an internal error page for a request that was not an error at all, and no
sentence the caller can show anybody.

So this handler maps the two shipment exceptions onto 409, and leaves every
other exception to DRF's own handler untouched. Wired up as
REST_FRAMEWORK['EXCEPTION_HANDLER'] in config/settings.py, which means no view
has to remember to catch them — including the views nobody has written yet.
That is the point: the rule holds because it is unavoidable, not because
every author remembered it.
"""

from rest_framework.views import exception_handler as drf_exception_handler

from .models import InvalidShipmentTransition, ShipmentLocked


def api_exception_handler(exc, context):
    """DRF's handler, plus the shipment lock."""
    if isinstance(exc, (ShipmentLocked, InvalidShipmentTransition)):
        # Imported here rather than at module scope: accounts.views imports
        # this module's siblings, and a top-level import would close the loop.
        from .views import ShipmentChangeRefused

        exc = ShipmentChangeRefused(str(exc))

    return drf_exception_handler(exc, context)
