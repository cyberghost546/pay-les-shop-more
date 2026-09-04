"""Public booking route, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("bookings/", views.BookingCreateView.as_view(), name="booking-create"),
]
