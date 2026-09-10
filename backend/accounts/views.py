"""API endpoints for the React frontend.

Session-cookie auth throughout. The browser holds an HttpOnly session cookie
it will not reveal to JavaScript, and echoes a CSRF token back in a header on
every write.
"""

from django.contrib.auth import login, logout, update_session_auth_hash
from django.db.models import Q
from django.http import FileResponse, Http404
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import (
    APIException,
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .emails import send_password_reset
from .models import Address, Package, PackageDocument, ShipmentLocked
from .serializers import (
    AccountDeleteSerializer,
    AddressSerializer,
    LoginSerializer,
    PackageDocumentSerializer,
    PackageDocumentUploadSerializer,
    PackageSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
)


class ShipmentChangeRefused(APIException):
    """A change to a shipment that has gone too far to be changed.

    409 rather than 400: the request was well formed and the caller was
    allowed to make it, so there is no field to highlight. The shipment has
    simply left, and a record of what was sent is not a form.

    Defined here, in the app that owns Package, and imported by the staff API
    as well - so a customer and a member of staff meeting the same rule get
    the same status code and the same sentence, rather than each API deciding
    for itself what a refusal looks like.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This shipment can no longer be changed."


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
    """Read-only: customers follow their shipments, staff move them along.

    There is deliberately no write half here, and there never was. A customer
    changing their own shipment's status or destination is not a thing the
    business does - the office does it, at the counter, from the dashboard.
    Each shipment carries `locked`, `locked_for_customer` and `lock_reason`
    (see PackageSerializer) so the profile page can render a shipment that has
    already gone as a record rather than as a form.
    """

    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Package.objects.filter(user=self.request.user)


class PackageDocumentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """The paperwork a customer attaches to their own shipment.

    The receipt for the television they bought, the shop's invoice, a customs
    form. It goes the opposite way to an invoice: the business sends those out,
    and these come in.

    Staff read the same rows through the same view. The queryset below is what
    decides who sees what, in one place rather than in each handler, so no id
    arriving from a browser has escaped being narrowed to rows that caller may
    see - somebody else's receipt is a 404 and not a decision made later.
    """

    serializer_class = PackageDocumentSerializer
    permission_classes = [IsAuthenticated]
    # DRF's defaults already accept JSON, form and multipart, which is what
    # this viewset needs: uploads arrive as multipart and `attach` below is
    # ordinary JSON. Pinning it to multipart, as this once did, answered 415
    # to every JSON body — including that action's.

    def get_queryset(self):
        queryset = PackageDocument.objects.select_related(
            "customer", "package", "uploaded_by"
        )

        # Staff are the audience for these: a receipt nobody in the office can
        # open is a receipt that was not worth uploading.
        #
        # Scoped by `customer`, not by `package__user`: a document need not
        # have a shipment, and scoping through one would make every unattached
        # receipt invisible to the person who uploaded it.
        if not self.request.user.is_staff:
            queryset = queryset.filter(customer=self.request.user)

        params = self.request.query_params

        # ?package=<id> is how both the profile page and the dashboard ask for
        # the files belonging to one shipment.
        package = params.get("package")
        if package:
            queryset = queryset.filter(package_id=package)

        # The dashboard's own three, none of which a customer has any use for
        # but none of which leak anything either: the queryset above has
        # already narrowed to rows the caller may see, so these only ever
        # shrink that set further.
        if params.get("unattached") == "true":
            # The queue that matters: a document nobody has filed against a
            # shipment yet.
            queryset = queryset.filter(package__isnull=True)

        kind = params.get("kind")
        if kind in dict(PackageDocument.Kind.choices):
            queryset = queryset.filter(kind=kind)

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(note__icontains=search)
                | Q(original_name__icontains=search)
                | Q(customer__first_name__icontains=search)
                | Q(customer__last_name__icontains=search)
                | Q(customer__email__icontains=search)
                | Q(package__tracking_number__icontains=search)
            )

        return queryset

    def create(self, request, *args, **kwargs):
        """Attach a file to one of the caller's own shipments.

        The package comes from the body, so it is checked against the caller
        rather than trusted: without that, any signed-in customer could file a
        receipt under a stranger's parcel and have the office read it there.
        """
        body = PackageDocumentUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        package = self._package_for(request)
        upload = body.validated_data["file"]

        # The rule at the heart of this: paperwork for something bought now
        # cannot be filed against a shipment that has already left. The
        # receipt is still kept - it arrives unfiled, exactly as a receipt for
        # a parcel that does not exist yet does, and the office files it
        # against the new shipment when that shipment is created. Losing the
        # upload would teach customers to keep quiet about the second purchase.
        filed_separately = False
        if package is not None and not package.can_change(by_staff=request.user.is_staff):
            lock_reason = package.lock_reason
            package = None
            filed_separately = True

        # Whose it is. The shipment's owner when there is a shipment — so a
        # staff member attaching a receipt on a customer's behalf files it
        # under that customer and not under themselves — and otherwise the
        # person uploading.
        customer = package.user if package else request.user

        document = PackageDocument.objects.create(
            customer=customer,
            package=package,
            uploaded_by=request.user,
            kind=body.validated_data["kind"],
            note=body.validated_data.get("note", ""),
            file=upload,
            # Kept so the customer's own list shows the name they recognise.
            # Truncated rather than refused: a name too long for the column is
            # not a reason to reject a valid receipt.
            original_name=(upload.name or "")[:255],
            content_type=(upload.content_type or "")[:100],
            size_bytes=upload.size,
        )

        data = self.get_serializer(document).data

        if filed_separately:
            # Said in the body rather than by a different status code: the
            # upload did succeed, and 201 is the truth about it. What changed
            # is where it landed, and the caller is told so plainly enough to
            # put on the screen.
            data["filed_separately"] = True
            data["detail"] = (
                f"{lock_reason} Your file has been received and will be filed "
                "against the new shipment."
            )

        return Response(data, status=status.HTTP_201_CREATED)

    def _package_for(self, request):
        """The shipment this upload is for, if any, or a refusal.

        None is a real answer. A receipt exists before the parcel does —
        somebody buys a television and books the shipment days later — so a
        document with no shipment is a normal document, not an incomplete one.

        When a shipment *is* named it is checked against the caller rather
        than trusted: without that, any signed-in customer could file a
        receipt under a stranger's parcel and have the office read it there.
        Staff may attach to any package, which is what they do for a customer
        who has e-mailed one in.
        """
        package_id = request.data.get("package")
        if not package_id:
            return None

        packages = Package.objects.all()
        if not request.user.is_staff:
            packages = packages.filter(user=request.user)

        try:
            return packages.get(pk=package_id)
        except (Package.DoesNotExist, ValueError, TypeError):
            # The same answer whether the parcel does not exist or belongs to
            # somebody else. Telling those two apart would turn this into a
            # way to discover which tracking numbers are real.
            raise ValidationError({"package": "No such shipment."})

    def perform_destroy(self, instance):
        """Remove an upload, and the file with it.

        Deleting the row alone would leave the bytes on disk for ever, which
        for a document holding somebody's address and card digits is the one
        outcome a delete button must not have.

        A customer may withdraw what they sent in - the wrong photograph, the
        wrong parcel - right up until the shipment leaves. After that the
        paperwork is part of what was sent, and taking a receipt off a
        shipment already at sea is editing a record, not correcting a form.

        Staff may still remove anything. Somebody has to be able to clear up a
        receipt filed against the wrong shipment, and a misfiling discovered
        after the boat sailed is exactly when that matters most.
        """
        if not self.request.user.is_staff and instance.package_id:
            instance.package.check_can_change(by_staff=False)

        stored = instance.file.name
        instance.delete()
        if stored:
            instance.file.storage.delete(stored)

    @action(detail=True, methods=["post"])
    def attach(self, request, pk=None):
        """File a document against a shipment, or unfile it. Staff only.

        The other half of letting a receipt arrive before the parcel does.
        Somebody uploads the till receipt for a television on the day they buy
        it; the shipment is booked later, and this is what joins the two so
        the document turns up on the parcel where the office will look for it.

        Customers are refused. They choose a shipment when they upload, from
        a list that is already only their own — but a customer moving a
        document afterwards is a customer moving evidence between shipments,
        and the office is the party that has to be able to trust where a
        receipt is filed.
        """
        if not request.user.is_staff:
            raise PermissionDenied("Only staff can file a document.")

        document = self.get_object()
        package_id = request.data.get("package")

        # Unfiling is not blocked on a locked shipment, and filing onto one
        # is. The asymmetry is deliberate: taking a document off a shipment it
        # was never part of corrects a mistake in the filing, while putting a
        # new one on says something travelled that did not.
        if package_id in (None, "", "null"):
            # Unfiling is a real action: a receipt on the wrong parcel has to
            # be able to come off it, and setting it to nothing is how.
            document.package = None
        else:
            try:
                # Any customer's, because staff see every document here. The
                # owner does not change: whose paperwork this is was decided
                # at upload, and moving it between parcels must not quietly
                # reassign it to somebody else.
                target = Package.objects.get(pk=package_id)
            except (Package.DoesNotExist, ValueError, TypeError):
                raise ValidationError({"package": "No such shipment."})

            if target.locked:
                raise ShipmentChangeRefused(
                    f"{target.lock_reason} File this against the shipment "
                    "that carries it instead."
                )

            document.package = target

        document.save(update_fields=["package"])

        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """Stream the document itself.

        get_object() applies the queryset above, so this is already limited to
        a file the caller may see. The remaining failure is a row pointing at
        bytes that are not there - a media directory restored without its
        contents - which is a 404 rather than the 500 that opening a missing
        file would otherwise produce.
        """
        document = self.get_object()

        try:
            handle = document.file.open("rb")
        except FileNotFoundError:
            raise Http404("This document is missing.")

        # as_attachment, so a browser saves it under a name that means
        # something rather than rendering it in a tab named by its storage
        # path. See PackageDocument.filename for why that name is scrubbed.
        return FileResponse(
            handle,
            as_attachment=True,
            filename=document.filename,
            content_type=document.content_type or "application/octet-stream",
        )
