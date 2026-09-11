"""The warehouse intake sheet, as a record rather than a sheet of paper.

This is the form somebody fills in on the floor when goods arrive: was it
collected or dropped off, is it packed properly, is there damage, how many
colli, how big, by sea or by air. On paper it is a clipboard that then has to
find its way to the people who book the shipment in - and a clipboard on the
wrong desk is a shipment nobody is working on.

So a sheet here has two lives, and `status` is the line between them:

* A **draft** belongs to the warehouse. It is half-filled, it is wrong in
  places, and it is nobody else's business yet. Any staff account may edit it.
* A **released** sheet is a handover. The moment it is released the rest of
  the staff are mailed a copy and can start the process, so from then on the
  sheet is evidence of what was handed over and stops being editable - see
  `release()` below, which is the only way across that line.

Not a one-way door, though. `reopen()` puts a released sheet back into draft
so a mistake can be corrected, and bumps `revision` so that the next release
tells everybody which version they are looking at. The lock is there to stop
a handover being edited under the people acting on it, not to pretend nobody
ever writes down the wrong number.

Nothing here is visible to a customer. There is no customer-facing serializer
and no route outside /api/staff/, which is deliberate: the sheet holds what
staff wrote about a delivery - damage, bad packing, a name off the van - and
that is an internal record, not a shipment update.
"""

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class AlreadyReleased(Exception):
    """Raised when a sheet that has already gone out is released again.

    Its own exception rather than a bare ValueError, so the view can answer
    409 for it specifically and a double-clicked button reads as "this has
    already been sent" rather than as a server error.
    """


class NotReleased(Exception):
    """Raised when a sheet that is already a draft is reopened again.

    The mirror of AlreadyReleased, and answered the same way: 409, because the
    caller asked for something reasonable and somebody else got there first.
    """


class IntakeSheet(models.Model):
    """One intake sheet - one delivery of goods, received at the warehouse."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RELEASED = "released", "Released to the office"

    class Freight(models.TextChoices):
        # The same two words the paper form prints, and the same values the
        # booking form already stores, so the two can be compared without a
        # translation table in between.
        SEA = "sea", "Zeevracht"
        AIR = "air", "Luchtvracht"

    class Packaging(models.TextChoices):
        PALLET = "pallet", "Pallet"
        BOX = "doos", "Doos"
        COLLI = "colli", "Colli"
        CRATE = "kist", "Kist"
        OTHER = "other", "Anders"

    class Check(models.TextChoices):
        """The Ja / Nee boxes in the middle of the form.

        Three states, not two. A boolean cannot tell "we looked, there is no
        damage" from "nobody has looked yet", and on a form about damage that
        is the difference between a claim the company can defend and one it
        cannot. Blank is the unchecked state, and a new sheet starts there.
        """

        YES = "yes", "Ja"
        NO = "no", "Nee"

    # ------------------------------------------------------------------
    # Where it is in its short life
    # ------------------------------------------------------------------

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.DRAFT
    )

    # The handwritten box at the top right of the paper form. Free text rather
    # than a generated number: it is whatever was written on the sheet, and
    # half of them will be a booking reference that already exists.
    reference = models.CharField(
        max_length=50,
        blank=True,
        help_text="Whatever is written in the shipment box at the top.",
    )

    # ------------------------------------------------------------------
    # Ophalen - collection
    # ------------------------------------------------------------------

    pickup = models.BooleanField(
        default=False, help_text="Ophalen: collected by us rather than dropped off."
    )
    upper_floor = models.BooleanField(
        default=False,
        help_text="Verdieping: the collection is above the ground floor.",
    )
    # Who went. Names rather than a link to accounts: the men on the van are
    # not all users of this system, and a sheet has to be fillable for a
    # driver who has never signed in.
    employees = models.CharField(
        max_length=255, blank=True, help_text="Werknemers who did the collection."
    )
    pickup_location = models.CharField(max_length=255, blank=True)
    received_on = models.DateField(
        null=True,
        blank=True,
        help_text="Datum aanname goederen - when the goods were taken in.",
    )

    # ------------------------------------------------------------------
    # Inpakken - packing
    # ------------------------------------------------------------------

    packing_required = models.BooleanField(
        default=False, help_text="Inpakken: we pack it."
    )
    pallet_box = models.BooleanField(default=False, help_text="Palletdoos.")
    volume_m3 = models.DecimalField(
        "aantal kuub (m3)",
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )

    # ------------------------------------------------------------------
    # The three checks, and what the checker wants to say about them
    # ------------------------------------------------------------------

    packed_well = models.CharField(max_length=3, choices=Check.choices, blank=True)
    damage_present = models.CharField(max_length=3, choices=Check.choices, blank=True)
    address_label_present = models.CharField(
        max_length=3, choices=Check.choices, blank=True
    )
    check_notes = models.TextField(
        blank=True, help_text="Opmerkingen against the three checks above."
    )

    # ------------------------------------------------------------------
    # Who and where
    # ------------------------------------------------------------------

    supplier = models.CharField(max_length=255, blank=True)
    sender = models.CharField(max_length=255, blank=True)
    destination = models.CharField(max_length=255, blank=True)
    recipient = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True, help_text="Opmerkingen about the consignment.")

    # ------------------------------------------------------------------
    # What actually turned up
    # ------------------------------------------------------------------

    colli_count = models.PositiveIntegerField(
        null=True, blank=True, help_text="Aantal colli."
    )
    packaging = models.CharField(max_length=10, choices=Packaging.choices, blank=True)
    # Only meaningful with packaging=other, which is the blank line the paper
    # form leaves after "kist /". Checked in the serializer rather than here,
    # so a draft can still be saved mid-sentence.
    packaging_other = models.CharField(max_length=100, blank=True)

    # One free-text box, exactly as the form has it. Splitting it into length,
    # width, height and weight would be tidier and would be wrong: a sheet
    # covers a pallet and two loose crates as often as it covers one box, and
    # four numeric columns cannot hold "2 pallets 120x80x150, 340kg in total".
    dimensions_weight = models.TextField(
        blank=True, help_text="Afmetingen & gewicht, as written."
    )

    freight = models.CharField(max_length=10, choices=Freight.choices, blank=True)

    # Naam werknemer - the person who signs the sheet off.
    #
    # Written from the account that creates the sheet and never editable
    # afterwards, which is the opposite of `employees` above and deliberately
    # so. That field records who went out on the van and is somebody else's
    # name to write; this one is a signature. A signature anybody can type
    # over is not evidence of who did the intake, and this sheet is the record
    # of what the company received and in what condition.
    #
    # Stored as text rather than read through `created_by` on the way out, so
    # that the name on a released sheet stays the name that signed it even
    # after the account is renamed, or erased.
    employee_name = models.CharField(max_length=150, blank=True)

    # ------------------------------------------------------------------
    # Optional links to the rest of the system
    # ------------------------------------------------------------------

    # Both nullable, and both stay nullable. Goods arrive at a warehouse
    # without a booking all the time - a supplier delivers against a customer
    # who has not filled the form in yet - and a sheet that cannot be written
    # until the paperwork catches up is a sheet that gets written on paper
    # instead.
    #
    # SET_NULL rather than CASCADE: deleting a booking must not erase the
    # record of goods that physically came through the door.
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets",
    )
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets",
    )

    # ------------------------------------------------------------------
    # Provenance
    # ------------------------------------------------------------------

    # SET_NULL on both: a sheet outlives the account of whoever filled it in,
    # and losing the name is better than losing the sheet.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets_created",
    )
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets_released",
    )

    released_at = models.DateTimeField(null=True, blank=True)

    # Null until the handover e-mail has actually left. A timestamp rather
    # than a boolean, and the same trick Notification.emailed_at uses: it is
    # what makes sending exactly-once under a worker retry, and a released
    # sheet with this still null is one nobody was mailed about.
    emailed_at = models.DateTimeField(null=True, blank=True)

    # How many times this sheet has been sent. 1 for the ordinary case; 2 or
    # more means it was released, found to be wrong, corrected and sent again.
    #
    # Counted rather than flagged, because the number is what the e-mail needs
    # to say: "corrected" on its own leaves somebody holding two printouts
    # with no way to tell which is the later one.
    revision = models.PositiveIntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "intake sheet"
        indexes = [
            # The dashboard's default view: one status, newest first.
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"Intake sheet {self.label}"

    @property
    def label(self):
        """What to call this sheet in a subject line or a heading.

        The reference if somebody wrote one, the row id otherwise. Never
        empty, because an e-mail titled "Intake sheet" tells nobody which.
        """
        return self.reference.strip() or f"#{self.pk}"

    @property
    def released(self):
        return self.status == self.Status.RELEASED

    def release(self, by=None):
        """Hand the sheet over, exactly once.

        A conditional UPDATE rather than a read-then-save, which is what makes
        a double-clicked Release button safe: two requests both read the sheet
        as a draft, and only one of them changes a row. The loser is told so.

        Callers want the e-mail sent as well - that is release_sheet() in
        warehouse/services.py, which wraps this. Kept apart so the state
        change can be tested without an outbox, and so nothing about mail can
        fail a handover that has already happened.
        """
        now = timezone.now()

        moved = IntakeSheet.objects.filter(
            pk=self.pk, status=self.Status.DRAFT
        ).update(
            status=self.Status.RELEASED,
            released_at=now,
            released_by=by,
            updated_at=now,
        )

        if not moved:
            raise AlreadyReleased(f"Intake sheet {self.label} was already released.")

        # Bring this instance in line with the row, so the caller can
        # serialise what it is holding rather than re-reading it.
        self.status = self.Status.RELEASED
        self.released_at = now
        self.released_by = by
        return self

    def reopen(self):
        """Put a released sheet back into draft, to correct a mistake.

        People write the wrong number of colli on a form. On paper that is a
        line through it and a correction in the margin, and the office is told
        again; refusing to allow it here would not make the record truer, it
        would make people stop using the form.

        So the sheet becomes editable again, and two things are arranged so
        that correcting it cannot pass quietly:

        * `emailed_at` goes back to null. It is the claim that stops the same
          sheet being mailed twice, and a correction has to be able to leave.
        * `revision` goes up. Every later e-mail says which version it is, so
          somebody holding a printout can tell whether they have the current
          one.

        What is not cleared is `released_at` and `released_by`. A correction
        does not unsay the first handover - it happened, and people acted on
        it. Both are overwritten by the next release, which is the record of
        when the version that now stands went out.

        A conditional UPDATE, like release(), so two people pressing Correct
        at the same moment produce one reopen and one refusal rather than a
        revision counted twice.
        """
        now = timezone.now()

        moved = IntakeSheet.objects.filter(
            pk=self.pk, status=self.Status.RELEASED
        ).update(
            status=self.Status.DRAFT,
            emailed_at=None,
            revision=models.F("revision") + 1,
            updated_at=now,
        )

        if not moved:
            raise NotReleased(f"Intake sheet {self.label} is already a draft.")

        self.status = self.Status.DRAFT
        self.emailed_at = None
        # Read back rather than incremented here: the row was updated with an
        # F() expression, and the instance must not guess at what it became.
        self.revision = (
            IntakeSheet.objects.filter(pk=self.pk)
            .values_list("revision", flat=True)
            .first()
        )
        return self
