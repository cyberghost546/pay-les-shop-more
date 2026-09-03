"""Where staff actually read what came in through the forms."""

from django.contrib import admin

from .models import ContactMessage, QuoteRequest


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "name", "email", "handled", "created_at")
    list_filter = ("handled", "subject", "created_at")
    search_fields = ("name", "email", "subject", "message")
    date_hierarchy = "created_at"

    # Submissions are a record of what someone sent; only the handled flag is
    # ours to change.
    readonly_fields = ("name", "email", "subject", "message", "language", "created_at")

    actions = ["mark_handled"]

    @admin.action(description="Mark selected messages as handled")
    def mark_handled(self, request, queryset):
        updated = queryset.update(handled=True)
        self.message_user(request, f"{updated} message(s) marked as handled.")


@admin.register(QuoteRequest)
class QuoteRequestAdmin(admin.ModelAdmin):
    list_display = ("full_name", "destination", "email", "status", "created_at")
    list_filter = ("status", "destination", "created_at")
    search_fields = ("first_name", "last_name", "email", "message")
    date_hierarchy = "created_at"

    readonly_fields = (
        "destination",
        "first_name",
        "last_name",
        "email",
        "message",
        "file",
        "language",
        "created_at",
        "updated_at",
    )
