"""Serializers for the staff dashboard.

These show more than the customer-facing ones do — a quote request's message,
who owns a package — so they are only ever reachable behind IsStaff.

Each one still lists its fields explicitly and marks as read-only everything
that is a record of what happened rather than a decision staff get to make.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.models import Address, Package
from enquiries.models import ContactMessage, QuoteRequest

User = get_user_model()


class CustomerBriefSerializer(serializers.ModelSerializer):
    """Just enough about a customer to identify them in a list."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "phone_number"]

    def get_name(self, obj):
        # str(User) already handles the anonymised case, where there is no
        # name left to show.
        return str(obj)


class StaffAddressSerializer(serializers.ModelSerializer):
    """A customer's address, as the back office sees it."""

    country_display = serializers.CharField(source="get_country_display", read_only=True)

    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "street",
            "house_number",
            "postal_code",
            "city",
            "country",
            "country_display",
            "is_default",
        ]
        read_only_fields = fields


class StaffCustomerSerializer(serializers.ModelSerializer):
    """A customer with their addresses and a count of their shipments.

    Read-only throughout. Staff look people up here — to check a spelling
    before a delivery, or find whose package a tracking number belongs to —
    but changing someone's personal data is a heavier action than this screen
    should offer, and it already has a home in Django's admin.
    """

    name = serializers.SerializerMethodField()
    addresses = StaffAddressSerializer(many=True, read_only=True)
    package_count = serializers.IntegerField(read_only=True)
    # Set when the account has been erased; the row survives only to keep the
    # shipment records intact.
    is_erased = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "addresses",
            "package_count",
            "is_staff",
            "is_active",
            "is_erased",
            "date_joined",
        ]
        read_only_fields = fields

    def get_name(self, obj):
        # str(User) already handles the erased case, where there is no name
        # left to show.
        return str(obj)

    def get_is_erased(self, obj):
        return obj.anonymised_at is not None


class StaffPackageSerializer(serializers.ModelSerializer):
    """A shipment as the back office sees it: with its customer attached."""

    customer = CustomerBriefSerializer(source="user", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Package
        fields = [
            "id",
            "tracking_number",
            "customer",
            "description",
            "status",
            "status_display",
            "weight_kg",
            "value_eur",
            "delivery_address_text",
            "shipped_at",
            "delivered_at",
            # Editable here: it is a decision staff make, and the public
            # tracking page shows it.
            "estimated_arrival",
            "created_at",
            "updated_at",
        ]
        # The tracking number identifies the shipment to the carrier and the
        # customer; correcting a typo is an admin job, not a dashboard one.
        # The address snapshot is deliberately frozen (see Package.save).
        read_only_fields = [
            "id",
            "tracking_number",
            "delivery_address_text",
            "created_at",
            "updated_at",
            "shipped_at",
            "delivered_at",
        ]


class StaffQuoteRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    full_name = serializers.CharField(read_only=True)
    # The stored path is useless to the browser; this is the URL that serves
    # it, absolute when the serializer was given the request.
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = [
            "id",
            "destination",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "message",
            "file_url",
            "status",
            "status_display",
            "language",
            "created_at",
            "updated_at",
        ]
        # A submission is a record of what a visitor sent. Only the status is
        # ours to change.
        read_only_fields = [
            field for field in fields if field not in {"status"}
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        url = obj.file.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class StaffContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "subject",
            "message",
            "handled",
            "language",
            "created_at",
        ]
        read_only_fields = [
            field for field in fields if field not in {"handled"}
        ]
