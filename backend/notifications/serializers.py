"""The customer's own notifications, as the profile page reads them."""

from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Read-only end to end.

    `kind` and `context` go out as they are stored, because the React app is
    what turns them into a sentence in the reader's language. The server sends
    facts; the client owns the wording.

    Nothing here is writable: the only change a customer can make to a
    notification is marking it read, and that is an action on the viewset, not
    a field they assign.
    """

    tracking_number = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "context",
            "package",
            "invoice",
            "tracking_number",
            "created_at",
            "read_at",
            "is_read",
        ]
        read_only_fields = fields

    def get_tracking_number(self, obj):
        # From the context rather than the package row, so it still reads
        # correctly once the shipment it referred to has been deleted.
        return (obj.context or {}).get("tracking_number", "")

    def get_is_read(self, obj):
        return obj.read_at is not None
