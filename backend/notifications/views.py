"""The customer's notification list.

Scoped to request.user in get_queryset and nowhere else, the same way
AddressViewSet and PackageViewSet are: no id comes from the browser, so there
is no id to tamper with. A detail route can only ever address a row that the
queryset already narrowed to the signed-in customer, which is what makes
/api/notifications/<someone else's id>/ a 404 rather than a leak.
"""

from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """List your notifications, and mark them read.

    No create and no update: notifications are raised by the events in
    notifications/services.py, never by a request. Read-only plus two actions,
    the same arrangement as the staff invoice queue.
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)

        # ?unread=1 for the badge, which does not want the whole list. Only the
        # list is narrowed — a detail route addresses one known row, and
        # filtering there would 404 a notification that plainly exists.
        if self.action == "list" and self.request.query_params.get("unread") == "1":
            queryset = queryset.filter(read_at__isnull=True)

        return queryset

    def list(self, request, *args, **kwargs):
        """The page, plus the unread count that goes beside it.

        The count is of *all* unread notifications, not the unread ones on this
        page, so it does not change as the customer pages through them.
        """
        response = super().list(request, *args, **kwargs)

        response.data["unread"] = Notification.objects.filter(
            user=request.user, read_at__isnull=True
        ).count()

        return response

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        """Mark one notification read. Marking it twice is not an error."""
        notification = self.get_object()
        notification.mark_read()

        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        """Mark everything currently unread as read.

        One UPDATE rather than a loop, and filtered on read_at being null so a
        notification already read keeps the time it was first seen.
        """
        updated = Notification.objects.filter(
            user=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())

        return Response({"marked_read": updated, "unread": 0})
