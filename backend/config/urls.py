"""URL configuration for the project."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .health import health, ready

urlpatterns = [
    path('admin/', admin.site.urls),
    # Above the app routes so a probe never depends on an app's URL module
    # importing cleanly. Public by design — see config/health.py.
    path('api/health/', health, name='health'),
    path('api/ready/', ready, name='ready'),
    path('api/', include('accounts.urls')),
    path('api/', include('enquiries.urls')),
    path('api/', include('bookings.urls')),
    path('api/', include('notifications.urls')),
    path('api/', include('invoicing.urls')),
    # The back-office API. Behind IsStaff, so a non-staff account gets 403
    # from every route under it.
    path('api/staff/', include('staff.urls')),
]

if settings.DEBUG:
    # Development only. static() is a convenience for the runserver and does
    # nothing when DEBUG is off; in production a web server or object store
    # serves MEDIA_ROOT, which is how these visitor-uploaded files stay out of
    # Django's request path entirely.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
