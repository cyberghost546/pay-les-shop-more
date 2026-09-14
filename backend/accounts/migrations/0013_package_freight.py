from django.db import migrations, models


def copy_from_intake_sheets(apps, schema_editor):
    """Give existing shipments the freight their latest intake sheet names."""
    Package = apps.get_model("accounts", "Package")
    IntakeSheet = apps.get_model("warehouse", "IntakeSheet")

    sheets = (
        IntakeSheet.objects.exclude(freight="")
        .filter(package__isnull=False)
        .order_by("package_id", "-created_at")
        .values_list("package_id", "freight")
    )
    seen = set()
    for package_id, freight in sheets:
        if package_id in seen:
            continue
        seen.add(package_id)
        Package.objects.filter(pk=package_id, freight="").update(freight=freight)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_package_warehouse_stage'),
        ('warehouse', '0003_measurement'),
    ]

    operations = [
        migrations.AddField(
            model_name='package',
            name='freight',
            field=models.CharField(blank=True, choices=[('sea', 'Sea freight'), ('air', 'Air freight')], max_length=10),
        ),
        migrations.RunPython(copy_from_intake_sheets, migrations.RunPython.noop),
    ]
