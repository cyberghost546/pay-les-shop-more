"""Serializers for the public forms.

These accept input from anyone on the internet, so the limits here are the
only thing between a visitor and the database.
"""

from rest_framework import serializers

from .models import ContactMessage, QuoteRequest

# Must match the frontend's own check, or the picker offers files the API then
# rejects. The server is the one that actually counts.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["name", "email", "subject", "message", "language"]
        extra_kwargs = {
            "name": {"required": True, "allow_blank": False},
            "email": {"required": True},
            "subject": {"required": True, "allow_blank": False},
            "language": {"required": False},
        }

    def validate_message(self, value):
        text = value.strip()
        if len(text) < 10:
            raise serializers.ValidationError(
                "Your message must be at least 10 characters."
            )
        # An upper bound as well: a form with no ceiling is an easy way to
        # fill someone's disk.
        if len(text) > 5000:
            raise serializers.ValidationError("Your message is too long.")
        return text


class QuoteRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuoteRequest
        fields = [
            "destination",
            "first_name",
            "last_name",
            "email",
            "message",
            "file",
            "language",
        ]
        extra_kwargs = {
            "destination": {"required": True, "allow_blank": False},
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
            "email": {"required": True},
            "message": {"required": False, "allow_blank": True},
            "language": {"required": False},
        }

    def validate_file(self, value):
        if value is None:
            return value

        if value.size > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("That file is larger than 10 MB.")

        # Both checks, because either alone is weak: content_type is supplied
        # by the browser and can be spoofed, and an extension is just text.
        # Neither proves the contents, which is why the file is stored and
        # never executed or served back as HTML.
        extension = "." + value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""
        if extension not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError("Please choose a PDF, JPG or PNG file.")

        content_type = getattr(value, "content_type", None)
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError("Please choose a PDF, JPG or PNG file.")

        return value

    def validate_message(self, value):
        if len(value) > 5000:
            raise serializers.ValidationError("Your message is too long.")
        return value
