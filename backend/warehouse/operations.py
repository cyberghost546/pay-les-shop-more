"""What the warehouse floor does to a package, and the rules around it.

Every function here is a complete warehouse action: it checks that the caller
may do it, makes the change, and writes the PackageActivity row, all in one
transaction. Views call these and nothing else writes to the operation tables,
so there is exactly one place where "who may do what" is decided and one
place where the audit trail is written.

The checks are made here on the server. The React app hides buttons a worker
cannot use, but that is only tidiness; this is what holds.
"""

import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from accounts.events import record_event
from accounts.models import Package, PackageEvent
from accounts.warehouse import move_warehouse_stage

from .models import (
    MAX_SIDE_CM,
    MAX_WEIGHT_KG,
    MIN_SIDE_CM,
    MIN_WEIGHT_KG,
    PackageActivity,
    PackageDamagePhoto,
    PackageDamageReport,
    PackageMeasurement,
    PackagePackaging,
)

logger = logging.getLogger(__name__)

Stage = Package.WarehouseStage
Action = PackageActivity.Action

# Where saving a measurement moves a package that has not been measured yet.
BEFORE_MEASUREMENT = (Stage.AWAITING_PICKUP, Stage.RECEIVED, Stage.AWAITING_MEASUREMENT)

# The activity a stage change is recorded as. Anything not listed is a plain
# "status changed".
STAGE_ACTIONS = {
    Stage.RECEIVED: Action.PACKAGE_RECEIVED,
    Stage.PACKED: Action.PACKAGE_PACKED,
    Stage.READY: Action.PACKAGE_MARKED_READY,
}


class WarehouseConflict(APIException):
    """A well-formed request the package's state does not allow. 409."""

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This package cannot be changed in its current state."


def _person(user):
    return (user.get_full_name() or user.get_username()) if user else ""


def record_activity(package, user, action, description, **context):
    """Append one immutable activity row. Call inside the action's transaction.

    Unlike accounts.events.record_event this does not swallow failures: the
    warehouse's audit trail is part of the action, and an action whose record
    cannot be written is rolled back with it.
    """
    return PackageActivity.objects.create(
        package=package,
        user=user,
        action=action,
        description=description[:500],
        context={key: value for key, value in context.items() if value is not None},
    )


# ---------------------------------------------------------------- guards


def check_can_operate(user):
    if user is None or not user.is_authenticated or not user.can_use_warehouse:
        raise PermissionDenied("Warehouse operations need a warehouse or office account.")


def check_package_open(package):
    """Refuse warehouse work on a package that has left or been cancelled."""
    if package.status in Package.LOCKED_STATUSES:
        raise WarehouseConflict(
            f"This package is {package.get_status_display().lower()} and can no "
            "longer be changed by the warehouse."
        )


def allowed_stages(user):
    """The warehouse stages this user may put a package in."""
    if user is None or not user.can_use_warehouse:
        return ()
    if user.is_warehouse_worker_only:
        return Package.WAREHOUSE_WORKER_STAGES
    return tuple(Stage.values)


def _decimal(data, field, minimum, maximum, unit):
    raw = data.get(field)
    if raw in (None, ""):
        raise ValidationError({field: ["This value is required."]})
    try:
        value = Decimal(str(raw).strip().replace(",", "."))
    except (InvalidOperation, ValueError):
        raise ValidationError({field: ["Enter a number."]})
    if not value.is_finite():
        raise ValidationError({field: ["Enter a number."]})
    if value < minimum or value > maximum:
        raise ValidationError(
            {field: [f"Must be between {minimum} and {maximum} {unit}."]}
        )
    return value


def validate_measurement(data):
    """Parse and range-check the four numbers. Returns Decimals."""
    errors = {}
    values = {}
    for field, minimum, maximum, unit, places in (
        ("weight_kg", MIN_WEIGHT_KG, MAX_WEIGHT_KG, "kg", Decimal("0.01")),
        ("length_cm", MIN_SIDE_CM, MAX_SIDE_CM, "cm", Decimal("0.1")),
        ("width_cm", MIN_SIDE_CM, MAX_SIDE_CM, "cm", Decimal("0.1")),
        ("height_cm", MIN_SIDE_CM, MAX_SIDE_CM, "cm", Decimal("0.1")),
    ):
        try:
            value = _decimal(data, field, minimum, maximum, unit)
        except ValidationError as error:
            errors.update(error.detail)
            continue
        if value != value.quantize(places):
            errors[field] = [f"Use at most {abs(places.as_tuple().exponent)} decimal place(s)."]
            continue
        values[field] = value
    if errors:
        raise ValidationError(errors)
    return values


# ---------------------------------------------------------------- actions


def record_scan(package, user, code=""):
    check_can_operate(user)
    with transaction.atomic():
        return record_activity(
            package,
            user,
            Action.PACKAGE_SCANNED,
            f"Scanned by {_person(user)}" + (f" (code {code[:60]})" if code else ""),
            code=code[:60] or None,
        )


def change_stage(package, to_stage, user, *, reason=None):
    """Move the package to another warehouse stage, if this user may."""
    check_can_operate(user)

    if to_stage not in Stage.values:
        raise ValidationError({"stage": ["Not a warehouse stage."]})
    if to_stage not in allowed_stages(user):
        raise PermissionDenied(
            f"Warehouse workers cannot set a package to {Stage(to_stage).label.lower()}. "
            "That step belongs to the office."
        )
    if package.status == Package.Status.CANCELLED:
        raise ValidationError({"stage": ["This shipment was cancelled."]})
    # The office may still record that a locked shipment has left; the floor
    # may not rearrange one.
    if user.is_warehouse_worker_only:
        check_package_open(package)

    if to_stage == Stage.READY:
        _check_ready(package)

    with transaction.atomic():
        return _move(package, to_stage, user, reason=reason)


def _move(package, to_stage, user, *, reason=None):
    from_stage = package.warehouse_stage
    if not move_warehouse_stage(package, to_stage, actor=user, reason=reason):
        return False
    label = Stage(to_stage).label
    record_activity(
        package,
        user,
        STAGE_ACTIONS.get(to_stage, Action.PACKAGE_STATUS_CHANGED),
        f"{Stage(from_stage).label} → {label}" + (f" ({reason})" if reason else ""),
        from_stage=from_stage,
        to_stage=to_stage,
    )
    return True


def _check_ready(package):
    if not package.warehouse_measurements.exists():
        raise WarehouseConflict("Measure the package before marking it ready for shipping.")
    if package.damage_reports.filter(
        resolution_status=PackageDamageReport.Resolution.OPEN
    ).exists():
        raise WarehouseConflict(
            "This package has an open damage report. Resolve it before marking it ready."
        )


def current_measurement(package):
    return package.warehouse_measurements.select_related("worker").first()


def save_measurement(package, user, data):
    """Record a measurement, and move an unmeasured package to Measured."""
    check_can_operate(user)
    check_package_open(package)
    values = validate_measurement(data)

    with transaction.atomic():
        # Lock the package row so two workers measuring the same box at once
        # produce two ordered rows rather than two rows superseding one.
        package = Package.objects.select_for_update().get(pk=package.pk)
        previous = current_measurement(package)

        measurement = PackageMeasurement.objects.create(
            package=package, worker=user, supersedes=previous, **values
        )
        summary = (
            f"{measurement.weight_kg} kg · {measurement.length_cm} × "
            f"{measurement.width_cm} × {measurement.height_cm} cm · "
            f"{measurement.volume_m3} m³ · dim. weight {measurement.dimensional_weight_kg} kg"
        )
        record_activity(
            package,
            user,
            Action.MEASUREMENT_UPDATED if previous else Action.MEASUREMENT_COMPLETED,
            summary,
            measurement_id=measurement.pk,
            supersedes_id=previous.pk if previous else None,
        )

        if package.warehouse_stage in BEFORE_MEASUREMENT:
            _move(package, Stage.MEASURED, user, reason="Measurement saved")

    return measurement, package


def add_packaging(package, user, data):
    check_can_operate(user)
    check_package_open(package)

    packaging_type = data.get("packaging_type")
    if packaging_type not in PackagePackaging.Type.values:
        raise ValidationError({"packaging_type": ["Choose a packaging type."]})

    raw_quantity = data.get("quantity", 1)
    try:
        quantity = int(str(raw_quantity).strip())
    except (TypeError, ValueError):
        raise ValidationError({"quantity": ["Enter a whole number."]})
    if not 1 <= quantity <= 999:
        raise ValidationError({"quantity": ["Must be between 1 and 999."]})

    notes = str(data.get("notes") or "").strip()
    if len(notes) > 500:
        raise ValidationError({"notes": ["Keep notes under 500 characters."]})
    if packaging_type == PackagePackaging.Type.OTHER and not notes:
        raise ValidationError({"notes": ["Say what packaging was used."]})

    with transaction.atomic():
        record = PackagePackaging.objects.create(
            package=package,
            worker=user,
            packaging_type=packaging_type,
            quantity=quantity,
            notes=notes,
        )
        label = record.get_packaging_type_display()
        record_activity(
            package,
            user,
            Action.BUBBLE_WRAP_ADDED
            if packaging_type == PackagePackaging.Type.BUBBLE_WRAP
            else Action.PACKAGING_ADDED,
            f"{quantity} × {label}" + (f" · {notes}" if notes else ""),
            packaging_id=record.pk,
            packaging_type=packaging_type,
            quantity=quantity,
        )
        # Packaging being added is the clearest sign the box is waiting to
        # be packed, so a measured package moves on by itself.
        if package.warehouse_stage == Stage.MEASURED:
            _move(package, Stage.AWAITING_PACKAGING, user, reason="Packaging added")

    return record


def _read_photo(upload):
    if upload.size > PackageDamagePhoto.MAX_BYTES:
        raise ValidationError({"photos": ["Each photo must be 10 MB or smaller."]})
    head = upload.read(16)
    upload.seek(0)
    content_type = PackageDamagePhoto.sniff(head)
    if content_type is None:
        raise ValidationError({"photos": ["Photos must be JPEG, PNG or WebP images."]})
    return content_type


def report_damage(package, user, data, photos=()):
    check_can_operate(user)

    damage_type = data.get("damage_type")
    if damage_type not in PackageDamageReport.DamageType.values:
        raise ValidationError({"damage_type": ["Choose what kind of damage it is."]})

    description = str(data.get("description") or "").strip()
    if len(description) > 1000:
        raise ValidationError({"description": ["Keep the description under 1000 characters."]})
    if damage_type == PackageDamageReport.DamageType.OTHER and not description:
        raise ValidationError({"description": ["Describe the damage."]})

    photos = list(photos)
    if len(photos) > PackageDamagePhoto.MAX_PER_REPORT:
        raise ValidationError(
            {"photos": [f"Attach at most {PackageDamagePhoto.MAX_PER_REPORT} photos."]}
        )
    # Every file is checked before anything is written.
    types = [_read_photo(photo) for photo in photos]

    with transaction.atomic():
        report = PackageDamageReport.objects.create(
            package=package, worker=user, damage_type=damage_type, description=description
        )
        for index, (photo, content_type) in enumerate(zip(photos, types), start=1):
            stored = PackageDamagePhoto(
                report=report, content_type=content_type, size_bytes=photo.size
            )
            name = f"photo-{index}{PackageDamagePhoto.EXTENSIONS[content_type]}"
            stored.image.save(name, photo, save=False)
            stored.save()

        # The office hears about it once the report is really saved: queued on
        # commit, so a rolled-back report never mails anybody.
        transaction.on_commit(lambda: _queue_damage_email(report.pk))

        record_activity(
            package,
            user,
            Action.DAMAGE_REPORTED,
            report.get_damage_type_display()
            + (f": {description[:200]}" if description else "")
            + (f" ({len(photos)} photo{'s' if len(photos) != 1 else ''})" if photos else ""),
            damage_report_id=report.pk,
            damage_type=damage_type,
        )
    return report


def _queue_damage_email(report_id):
    """Hand the damage e-mail to the worker. Never fails the report."""
    from .tasks import send_damage_report_email

    try:
        send_damage_report_email.delay(report_id)
    except Exception:
        logger.exception(
            "Damage report %s was saved but its e-mail could not be queued.", report_id
        )


def resolve_damage(report, user, note=""):
    check_can_operate(user)
    note = str(note or "").strip()
    if len(note) > 500:
        raise ValidationError({"note": ["Keep the note under 500 characters."]})

    with transaction.atomic():
        if not report.resolve(user, note):
            raise WarehouseConflict("This damage report has already been resolved.")
        record_activity(
            report.package,
            user,
            Action.DAMAGE_RESOLVED,
            f"{report.get_damage_type_display()} resolved" + (f": {note}" if note else ""),
            damage_report_id=report.pk,
        )
    return report


def set_location(package, user, location):
    check_can_operate(user)
    check_package_open(package)

    location = str(location or "").strip().upper()
    if len(location) > 40:
        raise ValidationError({"location": ["Keep the location under 40 characters."]})

    previous = package.warehouse_location
    if location == previous:
        return package

    with transaction.atomic():
        package.warehouse_location = location
        package.save(update_fields=["warehouse_location", "updated_at"])
        record_activity(
            package,
            user,
            Action.LOCATION_CHANGED,
            f"{previous or 'No location'} → {location or 'No location'}",
            from_location=previous,
            to_location=location,
        )
    return package


def report_problem(package, user, note):
    check_can_operate(user)
    note = str(note or "").strip()
    if not note:
        raise ValidationError({"note": ["Say what the problem is."]})
    if len(note) > 500:
        raise ValidationError({"note": ["Keep it under 500 characters."]})

    with transaction.atomic():
        package.problem_note = note
        package.problem_reported_at = timezone.now()
        package.problem_reported_by = user
        package.save(
            update_fields=["problem_note", "problem_reported_at", "problem_reported_by", "updated_at"]
        )
        record_event(package, PackageEvent.Kind.PROBLEM_REPORTED, actor=user, note=note)
        record_activity(package, user, Action.PROBLEM_REPORTED, note)
    return package


def resolve_problem(package, user):
    check_can_operate(user)
    if not package.problem_note:
        return package

    note = package.problem_note
    with transaction.atomic():
        package.problem_note = ""
        package.problem_reported_at = None
        package.problem_reported_by = None
        package.save(
            update_fields=["problem_note", "problem_reported_at", "problem_reported_by", "updated_at"]
        )
        record_event(package, PackageEvent.Kind.PROBLEM_RESOLVED, actor=user, note=note)
        record_activity(package, user, Action.PROBLEM_RESOLVED, f"Cleared: {note}")
    return package
