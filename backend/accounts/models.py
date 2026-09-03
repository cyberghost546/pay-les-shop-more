"""Customer accounts, their addresses and their packages.

The user model is a custom one from the very start. Django can only switch
AUTH_USER_MODEL cleanly before the first migration is applied; changing it
later means dropping the database or a painful manual migration.
"""

from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q


# Numbers are written a dozen ways across the islands and the Netherlands
# (+599 9 123 4567, 010-7670371, (599) 9123456), so this only checks the shape
# is plausible. The count of digits is the part worth enforcing.
phone_validator = RegexValidator(
    regex=r"^\+?[\d\s()-]{7,20}$",
    message="Enter a valid phone number, for example +599 9 123 4567.",
)


class User(AbstractUser):
    """A customer.

    username, first_name, last_name and the hashed password come from
    AbstractUser. Django never stores the password itself, only a salted
    PBKDF2 hash, and only ever through set_password().
    """

    # AbstractUser leaves email optional and non-unique. For this site it is
    # how people are contacted about a shipment, so it is required and unique.
    email = models.EmailField("email address", unique=True)

    phone_number = models.CharField(
        max_length=20,
        validators=[phone_validator],
        help_text="Used by the agent at the destination to arrange handover.",
    )

    # What this customer agreed to be contacted about. Shipping updates are on
    # by default because they are about an order the customer placed;
    # marketing is opt-in, which is what the GDPR requires.
    notify_shipping = models.BooleanField(default=True)
    notify_offers = models.BooleanField(default=False)
    notify_newsletter = models.BooleanField(default=False)

    # Set when the account has been erased. The row survives only to keep
    # shipment records intact; it holds no personal data after this point.
    anonymised_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "customer"
        verbose_name_plural = "customers"

    def __str__(self):
        if self.anonymised_at:
            return f"deleted customer #{self.pk}"
        full_name = self.get_full_name()
        return full_name or self.username

    @property
    def default_address(self):
        """The address to pre-fill on a new order, if one is set."""
        return self.addresses.filter(is_default=True).first()

    def anonymise(self):
        """Strip every piece of personal data, keeping the row itself.

        Used instead of a hard delete when the customer has shipments. Those
        are commercial records a shipping company has to keep — Dutch tax law
        requires seven years — but they do not need to carry a name, an
        e-mail address or a phone number to do that.

        The addresses are deleted outright; each package already holds its own
        frozen copy of where it was sent.
        """
        from django.utils import timezone

        self.addresses.all().delete()

        # Unique columns need unique replacements, so the primary key goes
        # into both. .invalid is reserved by RFC 2606 and can never be a real
        # domain, so this address cannot collide with a live one.
        self.username = f"deleted-{self.pk}"
        self.email = f"deleted-{self.pk}@deleted.invalid"
        self.first_name = ""
        self.last_name = ""
        self.phone_number = ""

        # Unusable password: no hash will ever match, so the account cannot be
        # logged into again.
        self.set_unusable_password()

        self.is_active = False
        self.notify_shipping = False
        self.notify_offers = False
        self.notify_newsletter = False
        self.anonymised_at = timezone.now()

        self.save()


class Address(models.Model):
    """One of a customer's delivery addresses.

    Separate table rather than columns on User: a customer can have several,
    and how many is not known up front.
    """

    class Country(models.TextChoices):
        # ISO 3166-1 alpha-2 stored, readable label shown.
        CURACAO = "CW", "Curaçao"
        BONAIRE = "BQ", "Bonaire"
        ARUBA = "AW", "Aruba"
        SINT_MAARTEN = "SX", "Sint Maarten"
        SURINAME = "SR", "Suriname"
        NETHERLANDS = "NL", "Nederland"

    user = models.ForeignKey(
        # settings.AUTH_USER_MODEL by string, so this file does not import the
        # user model directly and create a circular import.
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="addresses",
    )

    label = models.CharField(
        max_length=50,
        blank=True,
        help_text='Optional name for this address, such as "Home" or "Office".',
    )
    street = models.CharField(max_length=255)
    house_number = models.CharField(max_length=20)
    postal_code = models.CharField(max_length=20, blank=True)
    city = models.CharField(max_length=100)
    country = models.CharField(
        max_length=2,
        choices=Country.choices,
        default=Country.CURACAO,
    )

    is_default = models.BooleanField(
        default=False,
        help_text="Pre-filled when this customer places an order.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "addresses"
        ordering = ["-is_default", "city"]
        constraints = [
            # Enforced by the database, not just by save(): two concurrent
            # requests could otherwise each set a different default.
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_default=True),
                name="unique_default_address_per_user",
            )
        ]

    def __str__(self):
        return f"{self.street} {self.house_number}, {self.city}"

    def save(self, *args, **kwargs):
        """Keep exactly one default per customer.

        Setting a new default clears the old one; the first address a customer
        adds becomes the default automatically.
        """
        if self.is_default:
            self.__class__.objects.filter(user=self.user, is_default=True).exclude(
                pk=self.pk
            ).update(is_default=False)
        elif not self.__class__.objects.filter(user=self.user).exclude(pk=self.pk).exists():
            self.is_default = True

        super().save(*args, **kwargs)


class Package(models.Model):
    """A shipment belonging to a customer."""

    class Status(models.TextChoices):
        QUOTED = "quoted", "Quote sent"
        PAID = "paid", "Paid"
        PURCHASED = "purchased", "Products purchased"
        IN_TRANSIT = "in_transit", "In transit"
        ARRIVED = "arrived", "Arrived at destination"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="packages",
    )

    # SET_NULL, not PROTECT: PROTECT would make deleting a customer impossible,
    # because that cascade reaches their addresses and stops dead here — which
    # would leave no way to honour a request for erasure.
    delivery_address = models.ForeignKey(
        Address,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="packages",
    )

    # Where it was actually sent, frozen at the time of shipping. A shipment
    # record must not silently change when the customer later edits or removes
    # that address — this is the copy that survives.
    delivery_address_text = models.TextField(
        blank=True,
        help_text="Snapshot of the delivery address as it was when shipped.",
    )

    tracking_number = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUOTED,
    )

    weight_kg = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )
    # Decimal, never float: floats cannot represent money exactly.
    value_eur = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The two lookups the customer-facing pages will make.
            models.Index(fields=["user", "status"]),
            models.Index(fields=["tracking_number"]),
        ]

    def __str__(self):
        return f"{self.tracking_number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        """Freeze the delivery address the first time the package is saved."""
        if not self.delivery_address_text and self.delivery_address_id:
            address = self.delivery_address
            self.delivery_address_text = (
                f"{address.street} {address.house_number}\n"
                f"{address.postal_code} {address.city}\n"
                f"{address.get_country_display()}"
            ).strip()

        super().save(*args, **kwargs)
