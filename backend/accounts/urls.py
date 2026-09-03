"""API routes, mounted under /api/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("addresses", views.AddressViewSet, basename="address")
router.register("packages", views.PackageViewSet, basename="package")

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="csrf"),
    path("auth/signup/", views.SignupView.as_view(), name="signup"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("profile/password/", views.PasswordChangeView.as_view(), name="password"),
    path("profile/delete/", views.AccountDeleteView.as_view(), name="account-delete"),
    path("", include(router.urls)),
]
