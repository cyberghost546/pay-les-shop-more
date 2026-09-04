"""The booking form (boekingsbon), as a record rather than a sheet of paper.

The paper form is filled in by two people. The customer knows who is sending,
who is receiving, what is in the boxes and what it is worth; the office knows
the shipping number, the volume, the weight and whether the packing was done
properly. Both halves live on this one row, and which half a field belongs to
is written against it below — that split is what the API and the dashboard are
both built around.
"""

from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

# Same shape as the accounts app uses: numbers are written a dozen ways across
# the islands and the Netherlands, so this only checks it is plausible.
phone_validator = RegexValidator(
    regex=r"^\+?[\d\s()-]{7,20}$",
    message="Enter a valid phone number, for example +599 9 123 4567.",
)


class Booking(models.Model):
    """One booking form."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONFIRMED = "confirmed", "Confirmed"
        BOOKED_IN = "booked_in", "Booked in"
        SHIPPED = "shipped", "Shipped"
        CANCELLED = "cancelled", "Cancelled"

    class Freight(models.TextChoices):
        SEA = "sea", "Zeevracht"
        AIR = "air", "Luchtvracht"

    class Destination(models.TextChoices):
        ARUBA = "AW", "Aruba"
        BONAIRE = "BQ", "Bonaire"
        CURACAO = "CW", "Curaçao"
        SINT_MAARTEN = "SX", "Sint Maarten"
        SURINAME = "SR", "Suriname"
        OTHER = "other", "Overig"

    class Packing(models.TextChoices):
        SENDER = "sender", "Door u"
        COMPANY = "company", "Door Carib Intertrans"

    class PackingQuality(models.TextChoices):
        GOOD = "good", "Goed"
        POOR = "poor", "Niet goed"

    class Payment(models.TextChoices):
        CASH = "cash", "Contant"
        BANK = "bank", "Bank"

    class Unit(models.TextChoices):
        BOXES = "boxes", "Dozen"
        PALLETS = "pallets", "Pallets"
        COLLI = "colli", "Colli"

    class Vehicle(models.TextChoices):
        NOT_APPLICABLE = "na", "N.v.t."
        COMBUSTION = "combustion", "Benzine/Diesel"
        ELECTRIC = "electric", "Elektrisch/Hybride"

    # ---- office --------------------------------------------------------
    # Blank when the customer submits; filled in at the counter afterwards.

    shipping_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Assigned by the office. Left empty on submission.",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)

    volume_m3 = models.DecimalField(
        max_digits=8, decimal_places=3, null=True, blank=True,
        help_text="Measured at the counter.",
    )
    weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text="Measured at the counter.",
    )
    packing_quality = models.CharField(
        max_length=10,
        choices=PackingQuality.choices,
        blank=True,
        help_text="The office's assessment of the sender's packing, not the sender's.",
    )
    office_notes = models.TextField(
        blank=True, help_text="Internal. Never shown to the customer."
    )

    # ---- shipment ------------------------------------------------------

    freight = models.CharField(max_length=10, choices=Freight.choices, default=Freight.SEA)
    destination = models.CharField(max_length=10, choices=Destination.choices)
    # Only meaningful when destination is "other"; the serializer requires it
    # in that case and clears it otherwise.
    destination_other = models.CharField(max_length=100, blank=True)

    # ---- sender --------------------------------------------------------

    sender_first_name = models.CharField(max_length=150)
    sender_last_name = models.CharField(max_length=150)
    sender_address = models.CharField(max_length=255)
    sender_postal_code = models.CharField(max_length=20)
    sender_city = models.CharField(max_length=100)
    sender_phone = models.CharField(max_length=20, validators=[phone_validator])
    sender_email = models.EmailField()

    # ---- recipient -----------------------------------------------------

    recipient_first_name = models.CharField(max_length=150)
    recipient_last_name = models.CharField(max_length=150)
    recipient_address = models.CharField(max_length=255)
    recipient_city = models.CharField(max_length=100)
    recipient_phone = models.CharField(max_length=20, validators=[phone_validator])
    # The paper form has a box for it, but the agent phones rather than writes,
    # so an address on the island is enough to complete a delivery without it.
    recipient_email = models.EmailField(blank=True)

    # ---- the consignment ------------------------------------------------

    packing = models.CharField(
        max_length=10, choices=Packing.choices, default=Packing.SENDER
    )
    payment = models.CharField(
        max_length=10, choices=Payment.choices, default=Payment.BANK
    )

    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.BOXES)

    contents = models.TextField(blank=True)
    # "Zie bijlage" on the paper form: the list came separately.
    contents_attached = models.BooleanField(default=False)

    # Decimal, never float: this figure is what customs charges duty on, so it
    # has to be exactly what the sender declared.
    value_eur = models.DecimalField(max_digits=10, decimal_places=2)

    vehicle = models.CharField(
        max_length=12, choices=Vehicle.choices, default=Vehicle.NOT_APPLICABLE
    )

    # ---- emigration -----------------------------------------------------
    # Four Ja/Nee boxes that only matter when somebody is moving rather than
    # sending a parcel; the form hides them unless emigration is ticked.

    emigration = models.BooleanField(default=False)
    id_present = models.BooleanField(default=False)
    deregistered = models.BooleanField(default=False)
    deregistration_present = models.BooleanField(default=False)

    # ---- insurance ------------------------------------------------------

    insured = models.BooleanField(default=False)
    insured_value_eur = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    notes = models.TextField(blank=True, help_text="The sender's own remarks.")

    # ---- signature ------------------------------------------------------
    #
    # Typed rather than drawn, which is the point of the digital form: nobody
    # needs a pen. What makes it a signature is the three of these together —
    # the name typed, the terms explicitly agreed to, and the moment it
    # happened — not the shape of the letters.

    signature_name = models.CharField(
        max_length=200,
        help_text="Typed by the sender in place of a handwritten signature.",
    )
    agreed_terms = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)

    # Set when a signed-in customer books, so their bookings can be found from
    # their account. Null for anyone booking without an account, which the
    # form allows.
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )
    language = models.CharField(max_length=5, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["shipping_number"]),
        ]

    def __str__(self):
        who = f"{self.sender_first_name} {self.sender_last_name}".strip()
        return f"{self.shipping_number or 'unnumbered'} — {who}"

    @property
    def destination_label(self):
        """The destination as written, including a free-text "Overig"."""
        if self.destination == self.Destination.OTHER:
            return self.destination_other or self.get_destination_display()
        return self.get_destination_display()

    @property
    def sender_name(self):
        return f"{self.sender_first_name} {self.sender_last_name}".strip()

    @property
    def recipient_name(self):
        return f"{self.recipient_first_name} {self.recipient_last_name}".strip()
