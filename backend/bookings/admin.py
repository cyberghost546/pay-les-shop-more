"""Django admin for bookings, for anything the dashboard does not cover."""

from django.contrib import admin

from .models import Booking


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "shipping_number",
        "sender_name",
        "destination_label",
        "status",
        "created_at",
    )
    list_filter = ("status", "freight", "destination", "created_at")
    search_fields = (
        "shipping_number",
        "sender_first_name",
        "sender_last_name",
        "sender_email",
        "recipient_first_name",
        "recipient_last_name",
    )
    date_hierarchy = "created_at"

    # What the sender declared is a record of what they said, and the value is
    # what customs charges duty on. The office half is editable; their half is
    # not.
    readonly_fields = (
        "sender_first_name", "sender_last_name", "sender_address",
        "sender_postal_code", "sender_city", "sender_phone", "sender_email",
        "recipient_first_name", "recipient_last_name", "recipient_address",
        "recipient_city", "recipient_phone", "recipient_email",
        "freight", "destination", "destination_other", "packing", "payment",
        "quantity", "unit", "contents", "contents_attached", "value_eur",
        "vehicle", "emigration", "id_present", "deregistered",
        "deregistration_present", "insured", "insured_value_eur", "notes",
        "signature_name", "agreed_terms", "signed_at", "user", "language",
        "created_at", "updated_at",
    )
