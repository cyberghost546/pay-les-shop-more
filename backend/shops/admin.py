from django.contrib import admin

from .models import Shop


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("name", "url", "sort_order", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "url", "description")
    ordering = ("sort_order", "name")
