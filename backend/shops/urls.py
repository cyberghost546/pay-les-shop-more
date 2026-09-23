"""The public shops routes, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("shops/", views.PublicShopListView.as_view(), name="shop-list"),
    path("shops/<int:pk>/logo/", views.PublicShopLogoView.as_view(), name="shop-logo"),
]
