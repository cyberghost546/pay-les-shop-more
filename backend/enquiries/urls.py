"""Public form routes, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("contact/", views.ContactMessageView.as_view(), name="contact"),
    path("quote/", views.QuoteRequestView.as_view(), name="quote"),
]
