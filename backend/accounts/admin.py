"""Admin registration, so the tables are usable without writing views yet."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Address, Package, User


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
    list_display = ("tracking_number", "user", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("tracking_number", "user__username", "user__email")
    # A plain select would load every address in the database into the page.
    autocomplete_fields = ("user", "delivery_address")
    date_hierarchy = "created_at"
