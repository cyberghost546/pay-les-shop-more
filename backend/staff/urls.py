"""Staff dashboard routes, mounted under /api/staff/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from shops.views import ShopViewSet
from warehouse import records as warehouse_records
from warehouse import shipments as warehouse_shipments
from warehouse import views as warehouse_views

from . import views

router = DefaultRouter()
router.register("quotes", views.QuoteRequestViewSet, basename="staff-quote")
router.register("messages", views.ContactMessageViewSet, basename="staff-message")
router.register("packages", views.PackageViewSet, basename="staff-package")
router.register("bookings", views.BookingViewSet, basename="staff-booking")
router.register("invoices", views.InvoiceViewSet, basename="staff-invoice")
router.register("customers", views.CustomerViewSet, basename="staff-customer")
# The webshops the services page lists. The viewset lives in the shops app;
# this is the door it is reached through, so "everything under /api/staff/ is
# behind IsStaff" stays a single true sentence.
router.register("shops", ShopViewSet, basename="staff-shop")
# The warehouse's own intake sheets. Registered here rather than on a route of
# their own so that "everything under /api/staff/ is behind IsStaff" stays a
# single true sentence - the viewset lives in the warehouse app, but this is
# the door it is reached through.
router.register("intake", warehouse_views.IntakeSheetViewSet, basename="staff-intake")
# The warehouse's view of shipments: scan, move through the floor's stages,
# flag problems. IsWarehouseOrStaff, like the intake sheets.
router.register(
    "warehouse/shipments",
    warehouse_shipments.ShipmentViewSet,
    basename="staff-warehouse-shipment",
)
# The warehouse's own records, read by the floor and the office alike.
router.register(
    "warehouse/activity", warehouse_records.ActivityViewSet, basename="staff-warehouse-activity"
)
router.register(
    "warehouse/measurements",
    warehouse_records.MeasurementViewSet,
    basename="staff-warehouse-measurement",
)
router.register(
    "warehouse/packaging", warehouse_records.PackagingViewSet, basename="staff-warehouse-packaging"
)
router.register(
    "warehouse/damage", warehouse_records.DamageReportViewSet, basename="staff-warehouse-damage"
)

urlpatterns = [
    path("overview/", views.OverviewView.as_view(), name="staff-overview"),
    path(
        "warehouse/report/",
        warehouse_records.WarehouseReportView.as_view(),
        name="staff-warehouse-report",
    ),
    path("", include(router.urls)),
]
