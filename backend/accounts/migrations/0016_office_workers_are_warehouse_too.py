# The office role now carries is_warehouse as well as is_staff.
#
# No permission moves: staff/permissions.py has always let is_staff through
# the warehouse gate, so an office worker could already open the scanner and
# the intake sheets. What changes is that the account now says so, and every
# list drawn from the flag - the handover recipients, the Django admin's
# filters - stops leaving the office out of the warehouse.
#
# The flags are written from the role on save (User._sync_role), so this is
# only for rows already in the table: nobody has to re-save an account for
# their own flag to catch up.
#
# Reversing puts the flag back as it was, which costs an office worker nothing
# for the same reason.

from django.db import migrations


def office_gains_warehouse(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="office").update(is_warehouse=True)


def office_loses_warehouse(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="office").update(is_warehouse=False)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0015_delivery_confirmation"),
    ]

    operations = [
        migrations.RunPython(office_gains_warehouse, office_loses_warehouse),
    ]
