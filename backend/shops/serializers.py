"""Serializers for the shops.

The public one is read-only and deliberately narrow. The staff one accepts an
uploaded logo, which makes it the only place in this app where bytes arrive
from outside - so the size, the extension and the content type are all
checked here.
"""

from pathlib import Path

from rest_framework import serializers

from .models import ALLOWED_LOGO_EXTENSIONS, Shop

# A logo is a small flat graphic. Anything larger than this is a photograph
# somebody has picked by mistake.
MAX_LOGO_BYTES = 2 * 1024 * 1024

ALLOWED_LOGO_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def logo_path(shop):
    """The API path the logo is served from, or None when there is no logo.

    A route rather than the file's MEDIA_URL: Django only serves MEDIA_URL
    while DEBUG is on, so a link built from it works locally and answers 404
    on the deployed site. The frontend turns this into a full URL with
    apiUrl().
    """
    return f"/shops/{shop.pk}/logo/" if shop.logo else None


class PublicShopSerializer(serializers.ModelSerializer):
    """What the services page reads. No timestamps, no ordering, no flags."""

    logo = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = ["id", "name", "url", "logo", "description"]

    def get_logo(self, shop):
        return logo_path(shop)


class StaffShopSerializer(serializers.ModelSerializer):
    """What the dashboard reads and writes."""

    # Written as an upload, read back as the path the logo is served from -
    # so the same field name means "the file" going in and "where to find it"
    # coming out, and the dashboard never has to hold both.
    logo = serializers.FileField(write_only=True, required=False, allow_null=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = [
            "id",
            "name",
            "url",
            "logo",
            "logo_url",
            "description",
            "sort_order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_logo_url(self, shop):
        return logo_path(shop)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("A shop needs a name.")
        return name

    def validate_logo(self, value):
        # None clears the logo, which is a valid thing to ask for.
        if value is None:
            return value

        if value.size > MAX_LOGO_BYTES:
            raise serializers.ValidationError("A logo must be 2 MB or smaller.")

        extension = Path(value.name).suffix.lower()
        if extension not in ALLOWED_LOGO_EXTENSIONS:
            raise serializers.ValidationError(
                "A logo must be a PNG, JPEG or WebP file."
            )

        # The browser's claim about the file. Checked as well as the
        # extension, so neither one on its own is the whole gate.
        content_type = getattr(value, "content_type", None)
        if content_type and content_type not in ALLOWED_LOGO_CONTENT_TYPES:
            raise serializers.ValidationError(
                "A logo must be a PNG, JPEG or WebP file."
            )

        return value
