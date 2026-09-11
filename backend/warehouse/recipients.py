"""Who gets told when a sheet is released.

One function, in its own module, because "who counts as somebody to tell" is
the question most likely to be asked again later and the one worth being able
to point at. Today the answer is everybody who works here, office or floor,
bar the person who pressed the button; when that becomes a rota or a shift,
this is the file that changes and nothing else has to.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()


def handover_recipients(exclude=None):
    """The e-mail addresses a released sheet should go to.

    Four things keep an address out of the list:

    * Neither office nor warehouse, or not active. Both flags count: a
      released sheet is as much news to the next shift on the floor as it is
      to the office, and the warehouse is where a correction gets noticed. A
      deactivated account is somebody who has left.
    * No address to send to. An anonymised account has had its e-mail
      cleared, and Django's own blank default means a shell account created
      from the command line has none either.
    * `notify_warehouse` turned off. Honoured here rather than at the send,
      so the preference is visible next to the list it filters.
    * It is the person who released the sheet. They already know - they are
      looking at the confirmation - and a handover that mails its sender is
      a handover people start ignoring. Pass `exclude=None` to include them.

    Returns a sorted list, deduplicated. Sorted so a test can assert on it
    without sorting first, and deduplicated because two accounts sharing one
    shared mailbox should not mean two copies in it.
    """
    addresses = (
        User.objects.filter(is_active=True, notify_warehouse=True)
        .filter(Q(is_staff=True) | Q(is_warehouse=True))
        .exclude(email="")
        .values_list("email", flat=True)
    )

    skip = (exclude.email or "").casefold() if exclude is not None else None

    return sorted(
        {
            address
            for address in addresses
            if address and address.casefold() != skip
        }
    )
