"""Seed the shops that were hard-coded in the React app.

Names, links and order only. The logos stayed bundled with the frontend, and
the services page still falls back to its own copy for a shop whose row has
no logo yet - so the page looks the same the moment this lands, and each logo
is replaced as the office uploads one.

Reversible, and the reverse only removes rows it would have created: a shop
the office has since added by hand is not this migration's to delete.
"""

from django.db import migrations

SEED = [
    ("IKEA", "https://www.ikea.com/nl/nl/"),
    ("Bol.com", "https://www.bol.com/nl/nl/"),
    ("AutoDoc", "https://www.autodoc.nl/"),
    ("Coolblue", "https://www.coolblue.nl/"),
    ("H&M", "https://www2.hm.com/nl_nl/index.html"),
    ("MediaMarkt", "https://www.mediamarkt.nl/"),
    ("Action", "https://www.action.com/nl-nl/"),
    ("Zalando", "https://www.zalando.nl/"),
]


def seed(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")

    for index, (name, url) in enumerate(SEED):
        # get_or_create rather than create: running this against a database
        # that already has the shop must not raise on the unique name.
        Shop.objects.get_or_create(
            name=name,
            defaults={"url": url, "sort_order": index * 10, "is_active": True},
        )


def unseed(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")
    Shop.objects.filter(name__in=[name for name, _ in SEED]).delete()


class Migration(migrations.Migration):
    dependencies = [("shops", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
