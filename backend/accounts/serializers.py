"""Serializers: the boundary between JSON and the models.

Every field the API accepts is listed explicitly. A serializer built from
`__all__` will happily accept `is_superuser` the day someone adds it.
"""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
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
        ]
        # Username and join date are not editable through the profile form.
        read_only_fields = ["id", "username", "date_joined"]


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
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
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
