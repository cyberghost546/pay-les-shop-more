"""E-mail the daily warehouse report to the office.

    python manage.py send_warehouse_report                  # today
    python manage.py send_warehouse_report --date 2026-09-14
    python manage.py send_warehouse_report --yesterday      # for a morning run

Meant to run on a schedule: a Railway cron job, or any cron, once a day - at
the end of the working day for today's report, or first thing with
--yesterday. Sends to the same office staff who get damage e-mails.
"""

from datetime import timedelta

from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from warehouse import report
from warehouse.recipients import office_recipients


class Command(BaseCommand):
    help = "E-mail the day's warehouse report (per worker, with a CSV) to the office."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="The day to report on, YYYY-MM-DD. Default: today.")
        parser.add_argument("--yesterday", action="store_true", help="Report on yesterday.")

    def handle(self, *args, **options):
        if options["yesterday"]:
            day = timezone.localdate() - timedelta(days=1)
        else:
            try:
                day = report.parse_date(options.get("date") or "")
            except ValueError:
                raise CommandError("--date must be YYYY-MM-DD.")

        addresses = office_recipients()
        if not addresses:
            self.stderr.write("Nobody in the office to send the report to; nothing sent.")
            return

        data = report.build(day)
        message = EmailMessage(
            subject=f"Warehouse report {data['date']}",
            body=report.to_text(data),
            to=addresses,
        )
        message.attach(f"warehouse-report-{data['date']}.csv", report.to_csv(data), "text/csv")
        message.send(fail_silently=False)

        self.stdout.write(f"Warehouse report for {data['date']} sent to {len(addresses)} address(es).")
