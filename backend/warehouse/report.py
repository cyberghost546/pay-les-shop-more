"""The daily warehouse report: what the floor did on one day, per worker.

Built from PackageActivity, the warehouse's own immutable log, so the report
and the Activity page can never disagree. Used by the office's CSV download
(records.WarehouseReportView) and by `manage.py send_warehouse_report`.
"""

import csv
import io
from collections import defaultdict
from datetime import date as date_type

from django.utils import timezone

from accounts.models import Package

from .models import PackageActivity, PackageDamageReport

Action = PackageActivity.Action

# Report column -> the activity actions it counts.
COLUMNS = {
    "scanned": (Action.PACKAGE_SCANNED,),
    "received": (Action.PACKAGE_RECEIVED,),
    "measured": (Action.MEASUREMENT_COMPLETED, Action.MEASUREMENT_UPDATED),
    "packaging": (Action.BUBBLE_WRAP_ADDED, Action.PACKAGING_ADDED),
    "packed": (Action.PACKAGE_PACKED,),
    "ready": (Action.PACKAGE_MARKED_READY,),
    "damage": (Action.DAMAGE_REPORTED,),
}
LABELS = {
    "scanned": "Scanned",
    "received": "Received",
    "measured": "Measured",
    "packaging": "Packaging added",
    "packed": "Packed",
    "ready": "Marked ready",
    "damage": "Damage reported",
}
_COLUMN_FOR_ACTION = {action: column for column, actions in COLUMNS.items() for action in actions}


def parse_date(value):
    """A YYYY-MM-DD string as a date, today when blank. ValueError otherwise."""
    if not value:
        return timezone.localdate()
    return date_type.fromisoformat(value)


def build(day):
    """The report for one local day, as plain data."""
    rows = (
        PackageActivity.objects.filter(timestamp__date=day)
        .select_related("user")
        .values_list("user_id", "user__first_name", "user__last_name", "user__email", "action")
    )

    per_worker = defaultdict(lambda: dict.fromkeys(COLUMNS, 0))
    names = {}
    for user_id, first, last, email, action in rows:
        column = _COLUMN_FOR_ACTION.get(action)
        if column is None:
            continue
        per_worker[user_id][column] += 1
        names[user_id] = f"{first} {last}".strip() or email

    workers = sorted(
        ({"name": names[user_id], **counts} for user_id, counts in per_worker.items()),
        key=lambda row: row["name"].casefold(),
    )
    totals = {column: sum(row[column] for row in workers) for column in COLUMNS}

    return {
        "date": day.isoformat(),
        "columns": [{"key": key, "label": LABELS[key]} for key in COLUMNS],
        "totals": totals,
        "workers": workers,
        # Where things stand at the moment the report is made.
        "open_damage_reports": PackageDamageReport.objects.filter(
            resolution_status=PackageDamageReport.Resolution.OPEN
        ).count(),
        "ready_for_shipment": Package.objects.filter(
            warehouse_stage=Package.WarehouseStage.READY
        ).count(),
    }


def to_csv(report):
    """The report as CSV text: one row per worker, then a total row."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    keys = [column["key"] for column in report["columns"]]
    writer.writerow(["Worker", *[column["label"] for column in report["columns"]]])
    for row in report["workers"]:
        writer.writerow([row["name"], *[row[key] for key in keys]])
    writer.writerow(["Total", *[report["totals"][key] for key in keys]])
    return buffer.getvalue()


def to_text(report):
    """The report as the body of an e-mail."""
    lines = [f"Warehouse report for {report['date']}", ""]
    for column in report["columns"]:
        lines.append(f"{column['label']:<18} {report['totals'][column['key']]}")
    lines += [
        "",
        f"Ready for shipment now: {report['ready_for_shipment']}",
        f"Open damage reports:    {report['open_damage_reports']}",
        "",
    ]
    if report["workers"]:
        lines.append("Per worker is in the attached CSV.")
    else:
        lines.append("No warehouse activity was recorded on this day.")
    return "\n".join(lines)
