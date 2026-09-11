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


class IsWarehouseOrStaff(BasePermission):
    """The floor as well as the office.

    Used by the intake sheets and the scanner, and by nothing else. A
    warehouse account is is_warehouse without is_staff, so IsStaff above keeps
    it out of invoices, customers, quotes and Django's own /admin/ - which is
    the whole point of the two flags being separate.

    Read this and IsStaff together as the answer to "what can a phone on the
    warehouse floor reach": these two classes are the entire list, and a route
    that names neither is closed to a warehouse account.
    """

    message = "This area is for warehouse and office accounts only."

    def has_permission(self, request, view):
        user = request.user

        if not (user and user.is_authenticated and user.is_active):
            return False

        return bool(user.is_staff or user.is_warehouse)
