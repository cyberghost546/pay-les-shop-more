"""Notifications in Django's admin: readable, not editable.

Notifications are raised by events, never by hand, so there is no add form and
no change form. Being able to edit one would mean being able to rewrite what a
customer was told.
"""

from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "kind", "created_at", "read_at", "emailed_at")
    list_filter = ("kind", "read_at", "emailed_at")
    search_fields = ("user__email", "context")
    list_select_related = ("user",)
    ordering = ("-created_at",)

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
