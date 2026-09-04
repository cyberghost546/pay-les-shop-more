"""Serializers: the boundary between JSON and the models.

Every field the API accepts is listed explicitly. A serializer built from
`__all__` will happily accept `is_superuser` the day someone adds it.
"""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from .models import Address, Package

User = get_user_model()


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "street",
            "house_number",
            "postal_code",
            "city",
            "country",
            "is_default",
        ]
        # The owner comes from the session, never from the request body —
        # otherwise anyone could file an address under someone else's account.
        read_only_fields = ["id"]


class UserSerializer(serializers.ModelSerializer):
    """The signed-in customer's own profile."""

    addresses = AddressSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "addresses",
            "notify_shipping",
            "notify_offers",
            "notify_newsletter",
            "date_joined",
            # Read-only, and only ever a hint to the frontend about which
            # navigation to draw. The staff API checks the flag itself on
            # every request.
            "is_staff",
        ]
        # Username, join date and the staff flag are not editable here.
        read_only_fields = ["id", "username", "date_joined", "is_staff"]


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = [
            "username",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "password",
        ]
        extra_kwargs = {
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
            "email": {"required": True},
            "phone_number": {"required": True, "allow_blank": False},
        }

    def validate_email(self, value):
        # Addresses differ only by case in practice; store and compare lower.
        return value.lower()

    def validate_password(self, value):
        """Run Django's password validators, including the 12-character rule."""
        try:
            validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value

    def create(self, validated_data):
        # create_user hashes the password. Never User(**data) + save().
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        identifier = attrs["username"]

        # The login form asks for an e-mail address and sends it in this
        # field. Accounts created through signup have username == email, so
        # that used to line up by accident; one created with createsuperuser
        # does not, and those are exactly the staff accounts that need the
        # dashboard. Translating an address to its username first is what
        # makes the e-mail the way in for every account, however it was made.
        #
        # The address column is unique, so this can only ever find one row.
        match = User.objects.filter(email__iexact=identifier).first()
        username = match.get_username() if match else identifier

        user = authenticate(
            request=self.context.get("request"),
            username=username,
            password=attrs["password"],
        )

        # One message for both "no such user" and "wrong password". Telling
        # them apart lets an attacker enumerate who has an account.
        if user is None:
            raise serializers.ValidationError(
                "Unable to log in with the credentials provided.",
                code="invalid_credentials",
            )

        attrs["user"] = user
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        """Proving knowledge of the old password is what stops someone with a
        borrowed session from taking over the account."""
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is not correct.")
        return value

    def validate_new_password(self, value):
        user = self.context["request"].user
        try:
            validate_password(value, user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    """"I have forgotten my password" — just the address."""

    email = serializers.EmailField()
    # Which language to write the mail in. Optional; the same field the
    # contact and quote forms send.
    language = serializers.CharField(max_length=5, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.lower()

    def account(self):
        """The account to send to, or None.

        None is not an error and the view does not treat it as one — see the
        note there about not confirming which addresses are registered.

        Anonymised and deactivated accounts are excluded: an erased account
        has no password to reset, and its address column holds a placeholder
        that nobody reads anyway.
        """
        return User.objects.filter(
            email__iexact=self.validated_data["email"],
            is_active=True,
            anonymised_at__isnull=True,
        ).first()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """The new password, plus the two halves of the link from the e-mail."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.resolve_user(attrs["uid"])

        # One message for a malformed uid, an unknown account, and a token
        # that is expired or already used. Telling them apart would say
        # whether an account exists, and none of the three is separately
        # actionable: the answer to all of them is to ask for a fresh link.
        if user is None or not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "This link is no longer valid. Please request a new one."},
                code="invalid_token",
            )

        # Validated against the user, so a password containing their own name
        # or e-mail address is rejected by the similarity validator.
        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                {"new_password": list(error.messages)}
            ) from error

        attrs["user"] = user
        return attrs

    @staticmethod
    def resolve_user(uid):
        try:
            pk = urlsafe_base64_decode(uid).decode()
        except (TypeError, ValueError, UnicodeDecodeError):
            # The uid is whatever was in the URL, so it can be any text at all.
            return None

        # Checked before it reaches the query: filtering a primary key on
        # "abc" raises rather than returning nothing.
        if not pk.isdigit():
            return None

        return User.objects.filter(
            pk=pk, is_active=True, anonymised_at__isnull=True
        ).first()


class AccountDeleteSerializer(serializers.Serializer):
    """Erasing an account is irreversible, so it is not something a stolen
    session or a stray click should be able to do on its own."""

    current_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is not correct.")
        return value


class PackageSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Package
        fields = [
            "id",
            "tracking_number",
            "description",
            "status",
            "status_display",
            "weight_kg",
            "value_eur",
            "delivery_address",
            "delivery_address_text",
            "shipped_at",
            "delivered_at",
            "created_at",
        ]
        # Customers read their shipments; only staff change them.
        read_only_fields = fields
