"""API endpoints for the React frontend.

Session-cookie auth throughout. The browser holds an HttpOnly session cookie
it will not reveal to JavaScript, and echoes a CSRF token back in a header on
every write.
"""

from django.contrib.auth import login, logout, update_session_auth_hash
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import generics, mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .emails import send_password_reset
from .models import Address, Package
from .serializers import (
    AccountDeleteSerializer,
    AddressSerializer,
    LoginSerializer,
    PackageSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """Hands the browser a CSRF cookie before it makes its first write.

    The React app calls this once on load; every later POST/PATCH echoes the
    cookie value back in the X-CSRFToken header.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


def taken_email(errors):
    """True when signup failed because the address is already registered.

    DRF keeps the reason on each message as a `code`, so this reads that
    rather than matching on the English text of the message — which changes
    with the Django version and with the active language.
    """
    for field in ("email", "username"):
        for message in errors.get(field, []):
            if getattr(message, "code", None) == "unique":
                return True
    return False


class SignupView(generics.CreateAPIView):
    serializer_class = SignupSerializer
    permission_classes = [AllowAny]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        if not serializer.is_valid():
            errors = dict(serializer.errors)

            if taken_email(errors):
                # The frontend sets username to the e-mail address, so one
                # duplicate produces two errors. The visitor never typed a
                # username; telling them one is taken is noise about a field
                # that is not on their screen.
                errors.pop("username", None)
                # A stable code, so the frontend can offer "log in instead"
                # rather than guessing from which fields happen to have
                # errors — "enter a valid e-mail address" is also an error on
                # `email`, and means something completely different.
                errors["code"] = "email_taken"

            raise ValidationError(errors)

        user = serializer.save()

        # Log the new customer straight in, so they do not have to type the
        # password they just chose a second time.
        login(request, user)

        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})

        if not serializer.is_valid():
            # 401, not 400: the frontend distinguishes bad credentials from a
            # malformed request, and shows a deliberately vague message.
            return Response(
                {"detail": "Unable to log in with the credentials provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = serializer.validated_data["user"]
        # login() cycles the session key, which closes session-fixation: a
        # session id planted before login stops being valid at this point.
        login(request, user)

        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(generics.RetrieveUpdateAPIView):
    """GET and PATCH the signed-in customer's own profile."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # From the session, never from a URL parameter or the request body.
        # This is what makes it impossible to read someone else's profile.
        return self.request.user


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Changing the password invalidates the session hash, which would log
        # the customer out of the tab they are sitting in. This keeps them in.
        update_session_auth_hash(request, user)

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    """Step one: "I have forgotten my password".

    Always answers 204, whether or not the address belongs to an account.
    Answering differently would turn this into a way to ask the site which
    e-mail addresses are registered — the same reason the login endpoint gives
    one message for a wrong password and an unknown user.

    That is also why nothing here reports a mail failure: the response must not
    depend on anything that only happens when the account exists.
    """

    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.account()
        if user is not None:
            send_password_reset(user, serializer.validated_data.get("language", ""))

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    """Step two: the new password, with the link's uid and token."""

    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Deliberately not logged in afterwards. Someone holding the link has
        # proved they can read the mailbox, which is what earns them the right
        # to set a password — not the right to be signed in without using it.
        #
        # Saving the new hash also invalidates every existing session for this
        # account, which is the point when the reason for the reset was that
        # somebody else had got in.
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeleteView(APIView):
    """Erase the signed-in customer's account.

    Two different outcomes, on purpose:

    * No shipments — the row is deleted outright. Nothing needs keeping.
    * Has shipments — personal data is stripped and the row stays. A shipping
      company has to keep its commercial records (Dutch tax law: seven years),
      and a package row with a dangling user reference is a broken record.
      Anonymising satisfies the right to erasure without destroying the
      accounting trail.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AccountDeleteSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        had_packages = user.packages.exists()

        # End the session before touching the row, so no half-valid session
        # survives the change.
        logout(request)

        if had_packages:
            user.anonymise()
        else:
            user.delete()

        return Response(
            {"anonymised": had_packages},
            status=status.HTTP_200_OK,
        )


class AddressViewSet(viewsets.ModelViewSet):
    """A customer's own addresses. Several per customer, all CRUD."""

    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Scoped to the caller. Without this, /api/addresses/5/ would return
        # whichever customer's address happened to have id 5.
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PackageViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Read-only: customers follow their shipments, staff update them in the
    admin."""

    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Package.objects.filter(user=self.request.user)
