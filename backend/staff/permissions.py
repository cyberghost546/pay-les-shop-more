"""Who is allowed into the staff API."""

from rest_framework.permissions import BasePermission


class IsStaff(BasePermission):
    """Only active staff accounts.

    `is_staff` is the same flag that opens Django's own /admin/, so there is
    one place to grant or revoke back-office access rather than two that can
    drift apart.

    Checked on the server for every request. The React app also hides the
    dashboard from non-staff, but that is only tidiness — anyone can edit the
    JavaScript running in their own browser, and this is what actually holds.
    """

    message = "This area is for staff accounts only."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)
