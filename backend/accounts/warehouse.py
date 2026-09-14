"""Moving a shipment between warehouse stages, from anywhere.

Two callers: the warehouse's own stage buttons, and the office's status
change - a shipment the office marks as in transit has left the building, and
a board still calling it "packed" would soon be calling it overdue as well.
One function so both write the same fields and the same history.
"""

from django.utils import timezone

from .events import record_event
from .models import Package, PackageEvent

Stage = Package.WarehouseStage

# The customer-facing statuses that mean the goods have left the warehouse.
LEFT_THE_WAREHOUSE = (
    Package.Status.IN_TRANSIT,
    Package.Status.ARRIVED,
    Package.Status.DELIVERED,
)


def move_warehouse_stage(package, to_stage, *, actor=None, reason=None):
    """Put `package` in `to_stage`, stamp the time and record it.

    Returns True if anything changed. Call inside the caller's transaction.
    `reason` lands on the history line, so an automatic move reads as one.
    """
    from_stage = package.warehouse_stage
    if to_stage == from_stage:
        return False

    now = timezone.now()
    package.warehouse_stage = to_stage
    package.warehouse_stage_at = now
    fields = ["warehouse_stage", "warehouse_stage_at", "updated_at"]

    # Stamped the first time it is anywhere past pickup - a box that goes
    # straight to "packed" from the counter was still received today.
    if to_stage != Stage.AWAITING_PICKUP and package.received_at is None:
        package.received_at = now
        fields.append("received_at")

    package.save(update_fields=fields)
    record_event(
        package,
        PackageEvent.Kind.WAREHOUSE_STAGE_CHANGED,
        actor=actor,
        from_stage=from_stage,
        to_stage=to_stage,
        reason=reason,
    )
    return True


def follow_status(package, *, actor=None):
    """Mark the shipment shipped once its status says it has left.

    Only forwards: a status that has not left says nothing about where the
    goods are on the floor, so it never pulls the stage back.
    """
    if package.status in LEFT_THE_WAREHOUSE:
        return move_warehouse_stage(
            package,
            Stage.SHIPPED,
            actor=actor,
            reason=f"Status set to {package.get_status_display().lower()}",
        )
    return False
