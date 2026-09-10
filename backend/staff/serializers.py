"""Serializers for the staff dashboard.

These show more than the customer-facing ones do — a quote request's message,
who owns a package — so they are only ever reachable behind IsStaff.

Each one still lists its fields explicitly and marks as read-only everything
that is a record of what happened rather than a decision staff get to make.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import serializers

from accounts.models import Address, InvalidShipmentTransition, Package
from accounts.serializers import PackageDocumentSerializer
from enquiries.models import ContactMessage, QuoteRequest

User = get_user_model()


class CustomerBriefSerializer(serializers.ModelSerializer):
    """Just enough about a customer to identify them in a list."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "phone_number"]

    def get_name(self, obj):
        # str(User) already handles the anonymised case, where there is no
        # name left to show.
        return str(obj)


class StaffAddressSerializer(serializers.ModelSerializer):
    """A customer's address, as the back office sees it."""

    country_display = serializers.CharField(source="get_country_display", read_only=True)

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
            "country_display",
            "is_default",
        ]
        read_only_fields = fields


class StaffAddressWriteSerializer(serializers.ModelSerializer):
    """The half of an address the back office may fill in for a customer.

    Separate from StaffAddressSerializer, which stays read-only because it is
    nested inside the customer row: one serializer cannot be both the shape a
    list renders and the shape a write accepts without the write silently
    becoming possible everywhere the list appears.

    The owner is never in the body -- it comes from the URL, so a staff member
    cannot file an address under a different customer by editing the payload.
    """

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
        read_only_fields = ["id"]


class _StaffPackageInvoiceMixin:
    """Kept out of the class body above only to keep its field list readable."""

    def get_invoice(self, obj):
        # hasattr on a reverse one-to-one is how Django answers "is there
        # one" without a second query, given the select_related in the view.
        invoice = getattr(obj, "invoice", None)
        if invoice is None:
            return None

        return {
            "id": invoice.pk,
            "status": invoice.status,
            "status_display": invoice.get_status_display(),
        }


class StaffCustomerSerializer(serializers.ModelSerializer):
    """A customer with their addresses and a count of their shipments.

    The same User row the customer sees on their own profile page, which is
    what makes this screen and that one two views of one record rather than
    two copies: a correction made here is what the customer reads next time
    they open their profile, and an edit they make there is what staff see on
    the next load.

    Name, e-mail and phone are therefore writable — a wrong digit in a phone
    number is found by the agent trying to arrange a handover, not by the
    customer, so the back office needs to be able to fix it. Everything else
    stays read-only: the username is what someone types to sign in, the flags
    are a record rather than a decision, and the role moves through its own
    /role/ action where the refusals live.
    """

    name = serializers.SerializerMethodField()
    addresses = StaffAddressSerializer(many=True, read_only=True)
    package_count = serializers.IntegerField(read_only=True)
    # What this customer has settled and what they are still holding a quote
    # for, both annotated by CustomerViewSet.get_queryset. Decimals rather
    # than floats all the way to the browser, which is why they arrive as
    # strings: "1120.00" survives the trip exactly, 1120.0000000001 does not.
    paid_eur = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    outstanding_eur = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    # Set when the account has been erased; the row survives only to keep the
    # shipment records intact.
    is_erased = serializers.SerializerMethodField()
    # Whether the caller may switch this row between admin and customer. The
    # server decides it -- see CustomerViewSet.role, which refuses the same
    # cases again -- so the table can grey the control out without the React
    # app having to know the rules.
    can_change_role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "addresses",
            "package_count",
            "paid_eur",
            "outstanding_eur",
            "is_staff",
            # Shown so the table can say why a superuser's role is fixed here:
            # that account is granted more than this screen manages.
            "is_superuser",
            "is_active",
            "is_erased",
            "can_change_role",
            "date_joined",
        ]
        # Everything except the four contact fields below. The role moves
        # through the dedicated /role/ action, which is the one place its
        # refusals live, and the username is left alone because changing it
        # changes what the customer types to sign in.
        read_only_fields = [
            "id",
            "username",
            "name",
            "addresses",
            "package_count",
            "paid_eur",
            "outstanding_eur",
            "is_staff",
            "is_superuser",
            "is_active",
            "is_erased",
            "can_change_role",
            "date_joined",
        ]
        extra_kwargs = {
            # A customer is contacted about a shipment by one of these two, so
            # neither may be cleared from here. AbstractUser leaves the name
            # halves blank-able and the profile page allows the same, so this
            # does not tighten them beyond what the customer can do themselves.
            "email": {"required": True, "allow_blank": False},
            "phone_number": {"required": True, "allow_blank": False},
        }

    def to_internal_value(self, data):
        """Lowercase the e-mail before anything else looks at it.

        Addresses differ only by case in practice and the column is unique, so
        they are stored lowercased. Doing it here rather than in a
        `validate_email` is what makes the uniqueness check compare like with
        like: field validators run first, so "Agent@example.com" would clear a
        check against the stored "agent@example.com" and then collide on save.
        """
        if isinstance(data, dict) and isinstance(data.get("email"), str):
            data = data.copy()
            data["email"] = data["email"].lower()

        return super().to_internal_value(data)

    def get_name(self, obj):
        # str(User) already handles the erased case, where there is no name
        # left to show.
        return str(obj)

    def get_is_erased(self, obj):
        return obj.anonymised_at is not None

    def get_can_change_role(self, obj):
        request = self.context.get("request")
        if request is None:
            return False

        return not (
            obj.pk == request.user.pk
            or obj.is_superuser
            or obj.anonymised_at is not None
        )


class StaffRoleSerializer(serializers.Serializer):
    """The body of a role change: which of the two roles the account gets.

    A named role rather than a raw `is_staff` boolean, because that is what
    the screen offers and what the person pressing it means. The mapping onto
    the flag lives here, in one place.
    """

    ADMIN = "admin"
    CUSTOMER = "customer"

    role = serializers.ChoiceField(choices=[ADMIN, CUSTOMER])

    @property
    def grants_staff(self):
        return self.validated_data["role"] == self.ADMIN


class StaffPackageSerializer(_StaffPackageInvoiceMixin, serializers.ModelSerializer):
    """A shipment as the back office sees it: with its customer attached."""

    customer = CustomerBriefSerializer(source="user", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # What the customer has sent in about this shipment: the receipt for what
    # they bought, the shop's invoice, a customs form. Nested rather than
    # fetched per row, or opening the packages page would cost one request per
    # shipment to find out whether there is anything to look at.
    documents = PackageDocumentSerializer(many=True, read_only=True)
    # Whether this shipment has an invoice yet, and where it stands. The
    # Packages page needs it to decide between offering to raise one and
    # pointing at the one that exists — without it the button would be a
    # guess, and pressing it on a shipment that already has an invoice would
    # look like it had done nothing.
    invoice = serializers.SerializerMethodField()
    # The dashboard greys the row out with these rather than working the rule
    # out from the status itself, so that "what may still be edited" is
    # decided once, on the model, and not re-derived in JavaScript where it
    # could drift.
    locked = serializers.BooleanField(read_only=True)
    locked_for_customer = serializers.BooleanField(read_only=True)
    lock_reason = serializers.CharField(read_only=True)
    # Where it is going, at country level. The full address is on the row as
    # delivery_address_text; this is the one line the Add invoice form needs to
    # let an admin recognise a shipment in a list of them.
    destination = serializers.CharField(source="destination_label", read_only=True)

    class Meta:
        model = Package
        fields = [
            "id",
            "tracking_number",
            "customer",
            "description",
            "status",
            "status_display",
            "destination",
            "locked",
            "locked_for_customer",
            "lock_reason",
            "weight_kg",
            "value_eur",
            "delivery_address_text",
            "documents",
            "invoice",
            "shipped_at",
            "delivered_at",
            # Editable here: it is a decision staff make, and the public
            # tracking page shows it.
            "estimated_arrival",
            "created_at",
            "updated_at",
        ]
        # The tracking number identifies the shipment to the carrier and the
        # customer; correcting a typo is an admin job, not a dashboard one.
        # The address snapshot is deliberately frozen (see Package.save).
        read_only_fields = [
            "id",
            "tracking_number",
            "delivery_address_text",
            "created_at",
            "updated_at",
            "documents",
            "invoice",
            "shipped_at",
            "delivered_at",
            "destination",
            "locked",
            "locked_for_customer",
            "lock_reason",
        ]

    def validate(self, attrs):
        """Refuse the edit here as well as in the model.

        Package.save() is the rule and would raise on its own; this runs first
        so the dashboard gets a 400 naming the offending field rather than a
        bare 409, which is the difference between a form that highlights what
        is wrong and one that just says no.
        """
        package = self.instance
        if package is None:
            return attrs

        if "status" in attrs and attrs["status"] != package.status:
            try:
                package.check_transition(attrs["status"])
            except InvalidShipmentTransition as exc:
                raise serializers.ValidationError({"status": str(exc)})

        if package.locked:
            # Whatever else the request carries, a shipment that has left is
            # not describable any differently than it already is.
            frozen = {
                field: attrs[field]
                for field in Package.FROZEN_FIELDS
                if field in attrs and attrs[field] != getattr(package, field)
            }
            if frozen:
                raise serializers.ValidationError(
                    {field: package.lock_reason for field in frozen}
                )

        return attrs


class StaffQuoteRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    full_name = serializers.CharField(read_only=True)
    # The route that streams the attachment, not the file's own storage URL.
    #
    # `obj.file.url` was a MEDIA_URL path, and MEDIA_URL is served by
    # django.conf.urls.static in development and by nothing at all in
    # production — so this link worked on a developer's machine and answered
    # 404 on the deployed site. Publishing MEDIA_ROOT to fix that would have
    # been worse: these are files visitors attached to a quote request, and a
    # published media directory is one where they can be fetched by anyone who
    # guesses a name. The same reasoning as the invoice routes, arrived at
    # late for the same reason.
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = [
            "id",
            "destination",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "message",
            "file_url",
            "status",
            "status_display",
            "language",
            "created_at",
            "updated_at",
        ]
        # A submission is a record of what a visitor sent. Only the status is
        # ours to change.
        read_only_fields = [
            field for field in fields if field not in {"status"}
        ]

    def get_file_url(self, obj):
        """None when nothing was attached, so the dashboard can test it.

        A path rather than an absolute URL: behind a static host that rewrites
        /api to the API, an absolute URL names the API's own host, the browser
        declines to attach a SameSite cookie to an off-origin link, and the
        download comes back 403.
        """
        if not obj.file:
            return None
        return reverse("staff-quote-file", kwargs={"pk": obj.pk})


class StaffContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "subject",
            "message",
            "handled",
            "language",
            "created_at",
        ]
        read_only_fields = [
            field for field in fields if field not in {"handled"}
        ]
