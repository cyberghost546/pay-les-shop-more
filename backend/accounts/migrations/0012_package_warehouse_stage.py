import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def backfill_stages(apps, schema_editor):
    """Put existing shipments on the stage their status already implies.

    Without this every shipment in the database - including ones delivered
    last year - would appear on the board as waiting for pickup.
    """
    Package = apps.get_model("accounts", "Package")

    Package.objects.filter(
        status__in=["in_transit", "arrived", "delivered"]
    ).update(warehouse_stage="shipped")
    Package.objects.filter(status="ready_for_shipping").update(warehouse_stage="ready")

    # "Since" is unknown for old rows. updated_at is the closest honest guess,
    # and far better than today, which would hide a week-old backlog.
    Package.objects.update(warehouse_stage_at=models.F("updated_at"))


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_user_is_warehouse'),
    ]

    operations = [
        migrations.AddField(
            model_name='package',
            name='warehouse_stage',
            field=models.CharField(choices=[('awaiting_pickup', 'Waiting for pickup'), ('received', 'Received'), ('processing', 'Being processed'), ('packed', 'Packed'), ('ready', 'Ready for shipment'), ('shipped', 'Shipped')], default='awaiting_pickup', max_length=20),
        ),
        migrations.AddField(
            model_name='package',
            name='warehouse_stage_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name='package',
            name='received_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='package',
            name='problem_note',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='package',
            name='problem_reported_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='package',
            name='problem_reported_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddIndex(
            model_name='package',
            index=models.Index(fields=['warehouse_stage', 'warehouse_stage_at'], name='accounts_pa_wh_stage_idx'),
        ),
        migrations.AlterField(
            model_name='packageevent',
            name='kind',
            field=models.CharField(choices=[('status_changed', 'Shipment status changed'), ('warehouse_stage_changed', 'Warehouse stage changed'), ('problem_reported', 'Problem reported'), ('problem_resolved', 'Problem resolved'), ('invoice_raised', 'Invoice raised'), ('invoice_resubmitted', 'Invoice resubmitted'), ('invoice_approved', 'Invoice approved'), ('invoice_rejected', 'Invoice rejected'), ('invoice_sent', 'Invoice sent')], max_length=32),
        ),
        migrations.RunPython(backfill_stages, migrations.RunPython.noop),
    ]
