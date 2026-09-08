"""Customer accounts, their addresses and their packages.

The user model is a custom one from the very start. Django can only switch
AUTH_USER_MODEL cleanly before the first migration is applied; changing it
later means dropping the database or a painful manual migration.
"""

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


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

    # Which statuses mean the money has come in, kept here with the data
    # rather than in whichever view happens to be adding up totals.
    #
    # The flow is quoted -> paid -> purchased -> in transit -> arrived ->
    # delivered, so everything from PAID onwards is a shipment that has been
    # settled; a package cannot reach those states unpaid. QUOTED is the
    # customer holding a quote they have not acted on yet, which is the only
    # state that is money genuinely outstanding.
    #
    # CANCELLED is in neither list on purpose. It is not owed and it was not
    # earned, so counting it either way would misstate the books - a cancelled
    # shipment belongs in the count of shipments and in neither total.
    PAID_STATUSES = (
        Status.PAID,
        Status.PURCHASED,
        Status.IN_TRANSIT,
        Status.ARRIVED,
        Status.DELIVERED,
    )
    AWAITING_PAYMENT_STATUSES = (Status.QUOTED,)

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

    # What the customer is told to expect, set by staff when the shipment is
    # booked. A real field rather than a guess derived from the status: an
    # arrival date invented by arithmetic is a promise nobody made.
    estimated_arrival = models.DateField(
        null=True,
        blank=True,
        help_text="Shown on the public tracking page. Leave empty if not known yet.",
    )

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

    @property
    def progress(self):
        """How far along the journey is, 0-100, for a progress bar.

        A reading of the status rather than a measurement — the status is the
        only thing actually known — so the numbers are the even spacing of the
        stages, not a claim about distance covered or time elapsed.
        """
        return {
            self.Status.QUOTED: 5,
            self.Status.PAID: 20,
            self.Status.PURCHASED: 35,
            self.Status.IN_TRANSIT: 60,
            self.Status.ARRIVED: 80,
            self.Status.DELIVERED: 100,
            # Nothing is under way, so nothing is part-done.
            self.Status.CANCELLED: 0,
        }.get(self.status, 0)

    @property
    def destination_label(self):
        """Where it is going, at country level and no finer.

        The public tracking page shows this. The street address is on the row
        as well, and deliberately never leaves the server for an anonymous
        caller — a tracking number is not a credential.
        """
        if self.delivery_address_id and self.delivery_address:
            return self.delivery_address.get_country_display()

        # The address the package was actually sent to is frozen as text; its
        # last line is the country. Used when the address row itself is gone,
        # which happens when the customer erases their account.
        lines = [line for line in self.delivery_address_text.splitlines() if line.strip()]
        return lines[-1].strip() if lines else ""

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


def package_document_path(instance, filename):
    """Where a customer's own upload is written, under MEDIA_ROOT.

    Foldered by year and by shipment, so the files belonging to one parcel sit
    together and the directory does not grow into one flat listing of every
    receipt ever sent. Named by Django's own storage, which suffixes a name
    that is already taken rather than overwriting - two customers who both
    upload "receipt.pdf" must not end up sharing one file.

    The customer's own filename never reaches this path. It is used for the
    extension only, and only after being checked; see PackageDocument.EXTENSIONS.
    """
    # A document need not belong to a shipment — somebody can send in the
    # receipt for a television before the parcel carrying it exists — so the
    # folder falls back to the customer when there is no tracking number.
    folder = (
        instance.package.tracking_number
        if instance.package_id
        else f"customer-{instance.customer_id}"
    )
    return f"documents/{timezone.localtime():%Y}/{folder}/{filename}"


class PackageDocument(models.Model):
    """A file the customer attached to their own shipment.

    The receipt for the television they bought, the invoice from the shop, the
    customs form - the paperwork that belongs to a parcel and that the office
    needs to see but has no way to produce itself. It goes the opposite way to
    invoicing.Invoice, which is a document the business sends out; this is one
    the customer sends in.

    The file is never reachable through MEDIA_URL. A receipt carries a name, an
    address, a card's last digits and what somebody bought, and a MEDIA_URL
    link to one is a bearer token made of a guessable path. It is served by
    accounts.views.PackageDocumentViewSet.file, which knows who is asking.
    """

    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Receipt"
        INVOICE = "invoice", "Shop invoice"
        CUSTOMS = "customs", "Customs form"
        OTHER = "other", "Other"

    # What may be uploaded, as extension -> the bytes a real one starts with.
    #
    # The extension and the browser's content type are both supplied by the
    # caller and neither is evidence of anything. The signature is the check
    # that actually holds: a .exe renamed .pdf fails it, and so does an HTML
    # page saved as .jpg. JPEG's marker is two bytes because the third varies
    # by encoder, which is as far as a signature check can honestly go.
    SIGNATURES = {
        ".pdf": (b"%PDF-",),
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
    }

    # 10 MB. A phone photograph of a receipt is a megabyte or two; this leaves
    # room for a scan without letting the media directory fill up with video
    # somebody renamed.
    MAX_BYTES = 10 * 1024 * 1024

    # Whose paperwork this is. Required, and the column every read is scoped
    # by: a document does not need a shipment, but it always has an owner, and
    # without one there would be no way to answer "may this person see this".
    #
    # CASCADE, because erasing an account should take the receipts with it.
    # They are the customer's own documents rather than a record of what the
    # business did, which is what invoices are and why those are kept.
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )

    # Which shipment it belongs to, when it belongs to one.
    #
    # Optional on purpose. The receipt exists before the parcel does: somebody
    # buys a television, has the till receipt in their hand, and the shipment
    # is booked days later. Requiring the link would mean the only people who
    # could send a receipt in are the ones who no longer urgently need to.
    # Staff can see an unattached document on the customer and attach it later.
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )

    # Who sent it in. SET_NULL rather than CASCADE: erasing an account must
    # not delete the paperwork for a shipment that still exists, because the
    # office may still need to prove what was declared. The row keeps the
    # file and loses the person, which is what User.anonymise() does
    # everywhere else.
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_documents",
    )

    kind = models.CharField(
        max_length=20,
        choices=Kind.choices,
        default=Kind.RECEIPT,
    )

    file = models.FileField(upload_to=package_document_path)

    # What the customer called it, kept so their own list shows the name they
    # recognise rather than the storage path. Never used to build that path.
    original_name = models.CharField(max_length=255, blank=True)

    # Recorded at upload rather than sniffed on the way out, so serving a file
    # is a read and not an inspection.
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    # The customer's own words about what this is: "receipt from MediaMarkt".
    note = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # Everything attached to a parcel, and everything belonging to a
            # customer — the two queries the profile page and the dashboard
            # make between them.
            models.Index(fields=["package", "-created_at"]),
            models.Index(fields=["customer", "-created_at"]),
        ]

    def __str__(self):
        where = (
            self.package.tracking_number
            if self.package_id
            else f"{self.customer} (no shipment)"
        )
        return f"{self.get_kind_display()} for {where}"

    @property
    def filename(self):
        """The name to hand back on download.

        The customer's own name when there is one, because that is what they
        will recognise in their downloads folder - but only its basename, and
        only its own extension, so a name that arrived carrying a path cannot
        put one in a Content-Disposition header.
        """
        import os
        import re

        name = os.path.basename(self.original_name or "")
        # Anything a filesystem or a header would read as structure comes out.
        name = re.sub(r'[^A-Za-z0-9 ._-]', "", name).strip()

        if name and os.path.splitext(name)[1].lower() in self.SIGNATURES:
            return name

        extension = os.path.splitext(self.file.name)[1].lower() or ".bin"
        stem = (
            self.package.tracking_number
            if self.package_id
            else f"document-{self.pk}"
        )
        return f"{stem}-{self.kind}{extension}"


class PackageEvent(models.Model):
    """One thing that happened to an order, kept for good.

    The system had no memory. Package carries a status and two timestamps —
    shipped_at and delivered_at — which is the current state plus two moments
    out of seven, and Invoice.submit_for_review() deliberately erases
    reviewed_by, reviewed_at and rejection_reason every time a corrected
    invoice comes back round. An invoice rejected three times and then approved
    showed the approval and nothing else. None of that was recoverable, because
    none of it was ever written down.

    So this is the write-down. Append-only, one row per thing that happened,
    keyed to the order rather than to the package or the invoice separately:
    Invoice is OneToOne with Package, so an order's whole history — shipping
    and billing both — is one query in one chronological list, which is exactly
    what a timeline is.

    Two kinds of question it answers, from the same rows:

      * What happened to my order, and when.
      * Who approved that invoice, and what did the reviewer who rejected it
        the first time actually say.

    Rows are never updated. save() refuses it rather than trusting everyone to
    remember, because a log that can be edited answers the second question with
    whatever the last editor wanted it to say.
    """

    class Kind(models.TextChoices):
        # Written by staff.views.PackageViewSet.perform_update, the one place
        # a package's status changes.
        STATUS_CHANGED = "status_changed", "Shipment status changed"

        # Written by invoicing. Kept as distinct kinds rather than one
        # "invoice_changed" with the status in context, because a timeline
        # renders them with different words and a reader filtering for
        # rejections should not have to know the shape of a JSON blob.
        INVOICE_RAISED = "invoice_raised", "Invoice raised"
        INVOICE_RESUBMITTED = "invoice_resubmitted", "Invoice resubmitted"
        INVOICE_APPROVED = "invoice_approved", "Invoice approved"
        INVOICE_REJECTED = "invoice_rejected", "Invoice rejected"
        INVOICE_SENT = "invoice_sent", "Invoice sent"

    # The verdicts. Split out because the constraint below needs them and
    # because "show me the review history" is a query somebody will want.
    REVIEW_KINDS = (Kind.INVOICE_APPROVED, Kind.INVOICE_REJECTED)

    # CASCADE, matching Invoice.package: the history of an order that no longer
    # exists is not a record of anything. The erasure path customers actually
    # take is User.anonymise(), which keeps every package and so keeps this.
    package = models.ForeignKey(
        Package,
        on_delete=models.CASCADE,
        related_name="events",
    )

    kind = models.CharField(max_length=32, choices=Kind.choices)

    # When it happened, which is not always when the row was written: the
    # backfill in migration 0008 states times it read from shipped_at and
    # reviewed_at, and those are years older than the row. Hence a default
    # rather than auto_now_add — the caller is allowed to know better.
    at = models.DateTimeField(default=timezone.now)

    # When we found out. Separate from `at` so a backfilled row is honest about
    # being backfilled, and so two events claiming the same moment can still be
    # put in the order they were recorded.
    recorded_at = models.DateTimeField(auto_now_add=True)

    # PROTECT for the same reason as Invoice.reviewed_by: this is the audit
    # trail, and a staff account that has approved things cannot be deleted out
    # from under the record of it having done so. Null for events with no
    # person behind them — the render task marking an invoice sent is the
    # system finishing a job, not somebody deciding something.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="package_events",
    )

    # The facts the wording is built from: from_status and to_status for a
    # shipment move, reason for a rejection, invoice_number for the billing
    # ones. Denormalised on the same reasoning as Notification.context — the
    # line has to still read correctly after the invoice it describes has been
    # corrected out from under it.
    context = models.JSONField(default=dict, blank=True)

    class Meta:
        # Chronological, with the primary key breaking ties: a backfill can
        # write several events carrying the same timestamp, and a timeline that
        # reorders itself between two requests looks broken.
        ordering = ["at", "id"]
        indexes = [
            # The timeline query, and the only one that matters.
            models.Index(fields=["package", "at"]),
            # "Every rejection last month", for the review log.
            models.Index(fields=["kind", "-at"]),
        ]
        constraints = [
            # A verdict is somebody's. An approval with no approver is the
            # exact hole this table was built to close, so it is closed in the
            # database and not only in the helper that writes the rows.
            models.CheckConstraint(
                condition=(
                    ~Q(kind__in=["invoice_approved", "invoice_rejected"])
                    | Q(actor__isnull=False)
                ),
                name="package_event_verdict_has_an_actor",
            ),
        ]

    def __str__(self):
        return f"{self.package.tracking_number}: {self.get_kind_display()}"

    def save(self, *args, **kwargs):
        """Write once.

        Refused rather than merely discouraged. The whole value of this table
        is that a row means what it said when it was written; a log that can be
        edited after the fact proves nothing about who did what.

        Deleting is left alone: the CASCADE from Package has to work, and a
        history without its order is not a record anybody can read anyway.
        """
        if self.pk is not None and not self._state.adding:
            raise ValueError(
                "PackageEvent rows are append-only and cannot be changed. "
                "Record a new event instead."
            )
        return super().save(*args, **kwargs)
