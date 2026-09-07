"""Invoices in Django's admin: readable, not editable.

The state machine is the only way an invoice moves, and it lives on the model
rather than in a form. An admin change page with a status dropdown would be a
second way in that knows none of the rules, so there isn't one.
"""

from django.contrib import admin

from .models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("id", "tracking_number", "status", "reviewed_by", "reviewed_at")
    list_filter = ("status",)
    search_fields = ("package__tracking_number", "package__user__email")
    list_select_related = ("package", "reviewed_by")
    ordering = ("-created_at",)

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        # Invoices are created by ensure_invoice_for_package when a package is
        # paid, never by hand.
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description="tracking number", ordering="package__tracking_number")
    def tracking_number(self, obj):
        return obj.package.tracking_number
