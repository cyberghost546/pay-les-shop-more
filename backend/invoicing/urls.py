"""The customer's invoice routes, mounted under /api/ by config/urls.py.

Only the customer-facing half lives here. The review queue is part of the back
office and is routed by staff/urls.py, under /api/staff/, behind IsStaff.
"""

from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
# basename, because get_queryset is overridden and there is no .queryset for
# the router to read a name off. It also fixes the names the rest of the code
# reverses: invoice-list, invoice-detail and invoice-pdf.
router.register("invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = router.urls
