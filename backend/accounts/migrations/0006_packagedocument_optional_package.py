"""A document need not belong to a shipment.

The receipt exists before the parcel does: somebody buys a television, has the
till receipt in their hand, and books the shipment days later. Requiring the
link meant the only customers who could send one in were the ones who already
had a shipment — and a customer with none was shown a section with no upload
box at all, which read as the feature being missing.

So `package` becomes optional and `customer` arrives to carry the ownership
that `package.user` used to imply. Written by hand rather than generated,
because makemigrations cannot add a non-nullable foreign key without being
told what to put in the existing rows — and there are none to put anything in.
The AddField is unconditional for that reason: the table is empty at this
point in every environment, having been created by 0005 which is the migration
immediately before it.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_packagedocument"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="packagedocument",
            name="customer",
            field=models.ForeignKey(
                # A stand-in only for the schema editor; no row exists to
                # take it, and the field is not nullable afterwards.
                default=None,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="documents",
                to=settings.AUTH_USER_MODEL,
            ),
            preserve_default=False,
        ),
        # Whatever rows might somehow exist take their owner from the shipment
        # they hang off, which is exactly what scoped them before.
        migrations.RunSQL(
            sql=(
                "UPDATE accounts_packagedocument SET customer_id = ("
                "  SELECT user_id FROM accounts_package"
                "  WHERE accounts_package.id = accounts_packagedocument.package_id"
                ") WHERE customer_id IS NULL"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AlterField(
            model_name="packagedocument",
            name="customer",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="documents",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="packagedocument",
            name="package",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="documents",
                to="accounts.package",
            ),
        ),
        migrations.AddIndex(
            model_name="packagedocument",
            index=models.Index(
                fields=["customer", "-created_at"],
                name="accounts_pa_custome_ca3e8b_idx",
            ),
        ),
    ]
