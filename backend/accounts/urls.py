"""API routes, mounted under /api/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import public, views

router = DefaultRouter()
router.register("addresses", views.AddressViewSet, basename="address")
router.register("packages", views.PackageViewSet, basename="package")

urlpatterns = [
    # Open to anyone: the homepage's tracking box and statistics band.
    # A tracking number is an identifier, not a credential — see
    # accounts/public.py for what that means for these two.
    path(
        "track/<str:tracking_number>/",
        public.TrackingView.as_view(),
        name="track",
    ),
    path("stats/", public.SiteStatsView.as_view(), name="site-stats"),

    path("auth/csrf/", views.CsrfView.as_view(), name="csrf"),
    path("auth/signup/", views.SignupView.as_view(), name="signup"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path(
        "auth/password-reset/",
        views.PasswordResetRequestView.as_view(),
        name="password-reset",
    ),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("profile/password/", views.PasswordChangeView.as_view(), name="password"),
    path("profile/delete/", views.AccountDeleteView.as_view(), name="account-delete"),
    path("", include(router.urls)),
]
