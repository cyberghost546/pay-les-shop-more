"""Admin registration, so the tables are usable without writing views yet."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Address, Package, PackageEvent, User


class AddressInline(admin.TabularInline):
    """Edit a customer's addresses on the customer page itself."""

    model = Address
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Extends Django's UserAdmin so password hashing and the permission
    widgets keep working; a plain ModelAdmin would store passwords in clear
    text through the form.
    """

    inlines = [AddressInline]
    list_display = ("username", "first_name", "last_name", "email", "phone_number")
    search_fields = ("username", "first_name", "last_name", "email", "phone_number")

    # Add the custom fields to the stock fieldsets rather than replacing them.
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Contact", {"fields": ("phone_number",)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("Contact", {"fields": ("email", "phone_number")}),
    )


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("street", "house_number", "city", "country", "user", "is_default")
    list_filter = ("country", "is_default")
    search_fields = ("street", "city", "postal_code", "user__username")


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ("tracking_number", "user", "status", "locked", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("tracking_number", "user__username", "user__email")
    # A plain select would load every address in the database into the page.
    autocomplete_fields = ("user", "delivery_address")
    date_hierarchy = "created_at"

    @admin.display(boolean=True, description="Locked")
    def locked(self, package):
        return package.locked

    def get_readonly_fields(self, request, obj=None):
        """Grey out what a shipment that has left no longer gets to change.

        Package.save() refuses these anyway, so without this the admin offers
        a form that can only end in an error page. The fields are the model's
        own list rather than a second copy of it, so a column added to
        FROZEN_FIELDS later is greyed out here without anybody remembering to
        come back.

        Not a security boundary — an admin user with a shell can call save()
        with force_unlock=True, which is the deliberate way to repair a record
        and reads as exactly that at the call site.
        """
        readonly = super().get_readonly_fields(request, obj)
        if obj is not None and obj.locked:
            return tuple(readonly) + Package.FROZEN_FIELDS + ("status",)
        return readonly


@admin.register(PackageEvent)
class PackageEventAdmin(admin.ModelAdmin):
    """The order history, read-only — which is the whole point of it.

    Every permission below is closed. An append-only log with an edit form in
    front of it is not an audit trail, it is a note somebody can change after
    being asked about it, and the model's own save() refuses updates anyway.
    This makes the admin agree rather than offer a form that would only fail.

    It is registered mainly so the review history is reachable at all: "who
    rejected this invoice and what did they say" is now answerable, and until
    there is a screen for it this is the screen.
    """

    list_display = ("at", "tracking_number", "kind", "actor", "summary")
    list_filter = ("kind", "at")
    search_fields = (
        "package__tracking_number",
        "package__user__email",
        "actor__email",
    )
    list_select_related = ("package", "actor")
    date_hierarchy = "at"
    ordering = ("-at", "-id")

    def has_add_permission(self, request):
        # Events are recorded by record_event at the point the thing happened,
        # never typed in afterwards.
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="tracking number", ordering="package__tracking_number")
    def tracking_number(self, obj):
        return obj.package.tracking_number

    @admin.display(description="detail")
    def summary(self, obj):
        """The one fact that makes each kind worth reading, out of context."""
        context = obj.context or {}

        if obj.kind == PackageEvent.Kind.STATUS_CHANGED:
            before = context.get("from_status")
            after = context.get("to_status", "?")
            return f"{before} → {after}" if before else after

        if obj.kind == PackageEvent.Kind.INVOICE_REJECTED:
            return context.get("reason", "")

        if context.get("backfilled"):
            return "(backfilled)"

        return ""
