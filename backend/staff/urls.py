"""Staff dashboard routes, mounted under /api/staff/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from warehouse import views as warehouse_views

from . import views

router = DefaultRouter()
router.register("quotes", views.QuoteRequestViewSet, basename="staff-quote")
router.register("messages", views.ContactMessageViewSet, basename="staff-message")
router.register("packages", views.PackageViewSet, basename="staff-package")
router.register("bookings", views.BookingViewSet, basename="staff-booking")
router.register("invoices", views.InvoiceViewSet, basename="staff-invoice")
router.register("customers", views.CustomerViewSet, basename="staff-customer")
# The warehouse's own intake sheets. Registered here rather than on a route of
# their own so that "everything under /api/staff/ is behind IsStaff" stays a
# single true sentence - the viewset lives in the warehouse app, but this is
# the door it is reached through.
router.register("intake", warehouse_views.IntakeSheetViewSet, basename="staff-intake")

urlpatterns = [
    path("overview/", views.OverviewView.as_view(), name="staff-overview"),
    path("", include(router.urls)),
]
