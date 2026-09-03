"""What the public forms submit: contact messages and quote requests.

Both are written by anonymous visitors, so every field is treated as untrusted
input and nothing here is ever rendered as HTML.
"""

from django.db import models


class ContactMessage(models.Model):
    """A message from the contact page."""

    name = models.CharField(max_length=150)
    email = models.EmailField()
    subject = models.CharField(max_length=100)
    message = models.TextField()

    # Whether someone has dealt with it. Simple on purpose: a full ticketing
    # workflow is a different project.
    handled = models.BooleanField(default=False)

    # The language the visitor was reading, so the reply goes out in the same
    # one. Blank when the form did not send it.
    language = models.CharField(max_length=5, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["handled", "-created_at"])]

    def __str__(self):
        return f"{self.subject} — {self.email}"


def quote_upload_path(instance, filename):
    """Where an uploaded shopping list is stored.

    Django sanitises the filename and appends a random suffix on collision, so
    a visitor cannot overwrite an existing file or escape the directory by
    submitting something like ../../settings.py.
    """
    return f"quotes/{filename}"


class QuoteRequest(models.Model):
    """A "request a quote" submission from a destination page."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        QUOTED = "quoted", "Quote sent"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    # The island the request came from, as shown on that page.
    destination = models.CharField(max_length=100)

    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField()
    message = models.TextField(blank=True)

    # Optional: the copy tells people they may describe their list in the
    # message box instead of attaching anything.
    file = models.FileField(upload_to=quote_upload_path, blank=True, null=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW
    )
    language = models.CharField(max_length=5, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.first_name} {self.last_name} — {self.destination}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
