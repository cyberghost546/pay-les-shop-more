"""The webshops customers order from, as the office maintains them.

These used to be a hard-coded list in the React app, which meant a new shop
was a code change and a deploy. They are rows now, editable from the
dashboard by any staff account.

The logo is a FileField rather than an ImageField on purpose: ImageField
needs Pillow, which this project does not otherwise install, and the checks
that actually matter here - the content type, the extension and the size -
are done in the serializer either way.
"""

from pathlib import Path

from django.db import models

# Raster only. SVG is deliberately absent: it is a document, not a picture,
# and one served inline can carry script.
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# What the logo route answers with, by extension. A fixed map rather than a
# guess from the uploaded name, so the bytes are only ever labelled as one of
# the kinds this app accepts.
LOGO_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def shop_logo_path(instance, filename):
    """Where an uploaded logo is stored.

    Django sanitises the filename and appends a random suffix on collision,
    so an upload cannot overwrite an existing logo or escape the directory.
    """
    return f"shop-logos/{filename}"


class Shop(models.Model):
    """One webshop, as shown on the services page."""

    name = models.CharField(max_length=80, unique=True)

    # The Dutch storefront. This is a forwarding service for parcels bought in
    # the Netherlands, so a customer sent to the .com would land on a shop
    # that will not deliver to the warehouse.
    url = models.URLField(max_length=300)

    logo = models.FileField(upload_to=shop_logo_path, blank=True)

    # One short line under the name. Optional - the card closes up around it.
    description = models.CharField(max_length=200, blank=True)

    # Lowest first. Ties break on name, so two shops left at 0 still come out
    # in a stable order rather than whichever the database felt like.
    sort_order = models.PositiveIntegerField(default=0)

    # Hidden rather than deleted: a shop that is out of stock for a season
    # should not cost its logo and its description to put back.
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["is_active", "sort_order"])]

    def __str__(self):
        return self.name

    @property
    def logo_extension(self):
        """The stored logo's extension, lowercased, or '' when there is none."""
        return Path(self.logo.name).suffix.lower() if self.logo else ""

    @property
    def logo_content_type(self):
        """What the logo route labels the bytes as."""
        return LOGO_CONTENT_TYPES.get(self.logo_extension, "application/octet-stream")
