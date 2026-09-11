"""Intake sheets in Django's own admin.

The dashboard is where these are written; this is for the cases the dashboard
deliberately will not do - reading a sheet whose reference somebody has
forgotten, or looking at `emailed_at` to see whether a handover mail ever
actually left.

Released sheets are read-only here too. The rule that a handover is evidence
rather than a form does not stop applying because the URL changed.
"""

from django.contrib import admin

from .models import IntakeSheet


@admin.register(IntakeSheet)
class IntakeSheetAdmin(admin.ModelAdmin):
    list_display = (
        "label",
        "status",
        "destination",
        "colli_count",
        "received_on",
        "released_at",
        "emailed_at",
    )
    list_filter = ("status", "freight", "damage_present")
    search_fields = ("reference", "supplier", "sender", "recipient", "destination")
    date_hierarchy = "created_at"

    readonly_fields = (
        "status",
        "created_by",
        "released_by",
        "released_at",
        "emailed_at",
        "created_at",
        "updated_at",
    )

    def has_change_permission(self, request, obj=None):
        if obj is not None and obj.released:
            return False
        return super().has_change_permission(request, obj)
