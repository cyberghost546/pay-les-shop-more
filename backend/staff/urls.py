"""Staff dashboard routes, mounted under /api/staff/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("quotes", views.QuoteRequestViewSet, basename="staff-quote")
router.register("messages", views.ContactMessageViewSet, basename="staff-message")
router.register("packages", views.PackageViewSet, basename="staff-package")
router.register("bookings", views.BookingViewSet, basename="staff-booking")
router.register("customers", views.CustomerViewSet, basename="staff-customer")

urlpatterns = [
    path("overview/", views.OverviewView.as_view(), name="staff-overview"),
    path("", include(router.urls)),
]
