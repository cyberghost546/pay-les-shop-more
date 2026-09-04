"""The public booking endpoint. The staff half lives in staff/views.py."""

from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import Booking
from .serializers import BookingSerializer


class BookingCreateView(generics.CreateAPIView):
    """POST only. Nothing reads bookings back out here — staff read them in
    the dashboard, so a bug in this file cannot leak somebody's shipment."""

    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [AllowAny]
    # The same scope as the contact and quote forms: generous for a real
    # customer, tight enough that the form is a poor spam target.
    throttle_scope = "forms"
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Attached when the sender happens to be signed in, so the booking
        # turns up against their account. The form does not require one.
        user = request.user if request.user.is_authenticated else None
        booking = serializer.save(user=user)

        # Only the reference is echoed back — enough for the confirmation
        # screen, and nothing the sender did not already type.
        return Response(
            {"id": booking.pk, "created_at": booking.created_at},
            status=status.HTTP_201_CREATED,
        )
