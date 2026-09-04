"""URL configuration for the project."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('enquiries.urls')),
    path('api/', include('bookings.urls')),
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
