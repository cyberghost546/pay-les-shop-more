"""Fill an empty development database with something to look at.

    python manage.py seed_demo            # add the demo rows
    python manage.py seed_demo --clear    # remove them again
    python manage.py seed_demo --fresh    # remove, then add

    # Test shipments on an existing account, to see "Mijn zendingen" filled:
    python manage.py seed_demo --for client@client.com
    # ...and replace that account's test shipments with a fresh set, leaving
    # the demo customers alone:
    python manage.py seed_demo --for client@client.com --fresh

Everything it creates is tagged, and --clear removes exactly what it made and
nothing else: real accounts, real enquiries and real packages are never
touched. That includes the test shipments --for adds to a real account: they
carry the same PLSM-DEMO- tracking numbers, so --clear takes them away again
and leaves the account itself alone. The tag is the e-mail domain — .invalid is reserved by RFC 2606 and
can never belong to anyone, so a demo customer can never collide with a real
one or receive mail by accident.

Refuses to run when DEBUG is off. This writes fictional customers and
shipments; a production database is the last place that belongs.
"""

import random
import unicodedata
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Address, Package
from enquiries.models import ContactMessage, QuoteRequest

User = get_user_model()

# Everything the seeder creates is addressed under this domain, which is what
# makes --clear able to find its own rows and only its own.
DEMO_DOMAIN = "demo.invalid"

# Tracking numbers are shared with the customer, so they get a readable shape.
TRACKING_PREFIX = "PLSM-DEMO-"

# The test shipments --for puts on an existing account: something still to
# be sent, something on the way, and something already received, each with
# dates that fit its status.
#   (description, status, created days ago, shipped days ago, delivered days ago)
# None means "has not happened yet". Times of day are added below, so the
# dates also show a believable time.
ACCOUNT_PACKAGES = [
    # Still to be sent.
    ("Tuinmeubelset — 3 dozen (offerte)", Package.Status.QUOTED, 0, None, None),
    ("Keukenmachine — MediaMarkt", Package.Status.PAID, 1, None, None),
    ("Verjaardagscadeaus — Bol.com", Package.Status.PAID, 2, None, None),
    ("Sneakers en sportkleding — Zalando", Package.Status.PURCHASED, 3, None, None),
    ("Babyspullen — Prénatal", Package.Status.READY_FOR_SHIPPING, 6, None, None),
    ("Gereedschapskist — Hornbach", Package.Status.READY_FOR_SHIPPING, 7, None, None),
    # On the way.
    ("Boeken en schoolspullen — Bol.com", Package.Status.IN_TRANSIT, 12, 8, None),
    ("Onderdelen wasmachine — Autodoc", Package.Status.IN_TRANSIT, 15, 11, None),
    ("Laptop en accessoires — Coolblue", Package.Status.ARRIVED, 25, 20, None),
    # Received.
    ("2 dozen kleding — H&M", Package.Status.DELIVERED, 45, 40, 19),
    ("Telefoonhoesjes en opladers — Action", Package.Status.DELIVERED, 70, 64, 44),
    ("Kinderwagen — Babypark", Package.Status.DELIVERED, 110, 103, 80),
    # Cancelled.
    ("Winkelmandje IKEA", Package.Status.CANCELLED, 30, None, None),
]

# A fixed seed, so two runs produce the same database and a screenshot taken
# today still matches the data tomorrow.
RANDOM_SEED = 20260904


def demo_address(first, last):
    """An ASCII e-mail address built from a name that may not be ASCII.

    The names keep their accents — Domacassé and Curaçao are exactly the kind
    of text worth having on screen — but an address like
    jeanpierre.domacassé@... is not how anyone's mailbox is really spelt, and
    a demo that fakes it teaches the wrong lesson about the data.
    """
    plain = unicodedata.normalize("NFKD", f"{first}.{last}")
    plain = plain.encode("ascii", "ignore").decode("ascii")
    return f"{plain.lower().replace(' ', '').replace('-', '')}@{DEMO_DOMAIN}"


CUSTOMERS = [
    ("Maria", "Martina", "+599 9 512 4433", "CW", "Kaya Grandi", "24", "Willemstad"),
    ("Jean-Pierre", "Domacassé", "+599 9 660 1188", "CW", "Schottegatweg", "112", "Willemstad"),
    ("Shanice", "Frans", "+599 7 701 9922", "BQ", "Kaya Nikiboko", "8", "Kralendijk"),
    ("Randolph", "Croes", "+297 593 7741", "AW", "Caya Betico Croes", "45", "Oranjestad"),
    ("Fleur", "van Dijk", "+31 6 24 55 81 03", "NL", "Prinsengracht", "301", "Amsterdam"),
    ("Orlando", "Richardson", "+1 721 554 2210", "SX", "Front Street", "17", "Philipsburg"),
    ("Ingrid", "Bakhuis", "+597 8 812 445", "SR", "Domineestraat", "60", "Paramaribo"),
    ("Kevin", "Leito", "+599 9 522 7788", "CW", "Caracasbaaiweg", "9", "Willemstad"),
]

# (description, status, weight, value, days ago)
PACKAGES = [
    ("2 dozen kleding — Zalando", Package.Status.DELIVERED, "8.400", "312.50", 41),
    ("Laptop en accessoires — Coolblue", Package.Status.DELIVERED, "3.150", "1249.00", 34),
    ("Babyspullen — Prénatal", Package.Status.ARRIVED, "12.700", "486.20", 12),
    ("Onderdelen wasmachine", Package.Status.IN_TRANSIT, "5.900", "158.75", 9),
    ("Boeken en schoolspullen — Bol.com", Package.Status.IN_TRANSIT, "14.250", "203.40", 7),
    ("Sneakers en sportkleding", Package.Status.PURCHASED, "2.800", "289.99", 5),
    ("Keukenmachine — MediaMarkt", Package.Status.PAID, "7.100", "399.00", 4),
    ("Verjaardagscadeaus", Package.Status.PAID, None, "175.00", 3),
    ("Zonnepaneel-omvormer", Package.Status.QUOTED, "9.600", "845.00", 2),
    ("Tuinmeubelset — 3 dozen", Package.Status.QUOTED, "31.200", "1120.00", 1),
    ("Winkelmandje IKEA", Package.Status.CANCELLED, "4.400", "96.30", 22),
    ("Telefoonhoesjes en opladers", Package.Status.DELIVERED, "0.850", "64.95", 28),
]

# (destination, status, message, days ago)
QUOTES = [
    ("Curaçao", QuoteRequest.Status.NEW,
     "Goedemiddag, ik wil graag een winkelmandje van Bol.com laten versturen. "
     "Het gaat om ongeveer 6 kg aan boeken en speelgoed. Wat kost dat ongeveer?", 0),
    ("Bonaire", QuoteRequest.Status.NEW,
     "Hallo, ik heb een lijst met producten van Coolblue. Kunnen jullie mij een "
     "prijsopgave sturen voor verzending naar Kralendijk?", 1),
    ("Aruba", QuoteRequest.Status.NEW,
     "Good afternoon, I would like to ship a bicycle from the Netherlands to "
     "Oranjestad. Is that possible and what would it cost?", 2),
    ("Curaçao", QuoteRequest.Status.QUOTED,
     "Ik wil graag een nieuwe koelkast bestellen bij MediaMarkt. Graag een "
     "offerte inclusief invoerrechten.", 4),
    ("Sint Maarten", QuoteRequest.Status.QUOTED,
     "Please quote for two boxes of restaurant supplies, roughly 20 kg total.", 6),
    ("Bonaire", QuoteRequest.Status.ACCEPTED,
     "Bedankt voor de snelle offerte, ik ga akkoord met het voorstel.", 11),
    ("Curaçao", QuoteRequest.Status.ACCEPTED,
     "Akkoord met de prijs. Kunnen jullie de bestelling deze week plaatsen?", 16),
    ("Aruba", QuoteRequest.Status.DECLINED,
     "Dank voor de offerte, maar ik heb een goedkopere optie gevonden.", 25),
    ("Nederland", QuoteRequest.Status.NEW,
     "Ik woon in Rotterdam en wil een pakket naar mijn familie op Curaçao sturen. "
     "Hoe werkt dat precies?", 3),
    ("Suriname", QuoteRequest.Status.QUOTED,
     "Graag een prijs voor het versturen van gereedschap naar Paramaribo.", 8),
]

# (subject, message, handled, days ago)
MESSAGES = [
    ("Vraag over levertijd",
     "Hoe lang duurt verzending naar Bonaire ongeveer? Ik heb het pakket voor "
     "de kerst nodig en wil weten of dat nog haalbaar is.", False, 0),
    ("Tracking werkt niet",
     "Ik heb een trackingnummer gekregen maar ik zie geen updates meer sinds "
     "vorige week. Kunnen jullie kijken waar mijn pakket is?", False, 1),
    ("Question about customs",
     "Do I need to pay import duties myself, or is that included in the price "
     "you quote? I want to avoid surprises when the package arrives.", False, 2),
    ("Samenwerking webshop",
     "Wij zijn een webshop in Nederland en zoeken een partner voor verzending "
     "naar de Cariben. Met wie kunnen wij hierover spreken?", False, 5),
    ("Adres wijzigen",
     "Ik ben verhuisd binnen Willemstad. Kan het afleveradres van mijn lopende "
     "zending nog worden aangepast?", True, 9),
    ("Bedankt!",
     "Alles is netjes aangekomen en goed verpakt. Bedankt voor de goede service, "
     "ik kom zeker terug.", True, 14),
    ("Beschadigde doos",
     "Een van de dozen was ingedeukt bij aankomst. De inhoud lijkt heel, maar ik "
     "wilde het toch even melden.", True, 20),
    ("Factuur nodig",
     "Kan ik een factuur op bedrijfsnaam ontvangen voor mijn laatste zending?", True, 27),
]


class Command(BaseCommand):
    help = "Fill the development database with demo customers, packages and enquiries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove the demo rows and stop.",
        )
        parser.add_argument(
            "--fresh",
            action="store_true",
            help="Remove the demo rows first, then create them again.",
        )
        parser.add_argument(
            "--for",
            dest="for_email",
            metavar="EMAIL",
            help=(
                "Add test shipments (to send, on the way, received) to this "
                "existing account instead. Removed again by --clear."
            ),
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_demo only runs with DEBUG on. These are fictional "
                "customers and shipments; they do not belong in a production "
                "database."
            )

        # --for comes first: with it, --fresh replaces only that account's
        # test shipments and leaves the demo customers alone.
        if options["for_email"]:
            self.seed_account(options["for_email"], fresh=options["fresh"])
            return

        if options["clear"] or options["fresh"]:
            self.clear()
            if options["clear"]:
                return

        self.seed()

    # -- removing ---------------------------------------------------------

    def clear(self):
        """Delete exactly what this command created.

        Packages and addresses go with their customer through the cascade, so
        deleting the demo accounts is enough for those.
        """
        customers = User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")
        packages = Package.objects.filter(tracking_number__startswith=TRACKING_PREFIX)
        quotes = QuoteRequest.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")
        messages = ContactMessage.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")

        counts = (
            packages.count(),
            quotes.count(),
            messages.count(),
            customers.count(),
        )

        packages.delete()
        quotes.delete()
        messages.delete()
        customers.delete()

        self.stdout.write(
            "Removed {} package(s), {} quote request(s), {} message(s) and "
            "{} demo customer(s).".format(*counts)
        )

    # -- creating ---------------------------------------------------------

    @transaction.atomic
    def seed(self):
        if User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}").exists():
            raise CommandError(
                "Demo data is already present. Use --fresh to replace it, or "
                "--clear to remove it."
            )

        random.seed(RANDOM_SEED)
        now = timezone.now()

        customers = self.make_customers(now)
        self.make_packages(customers, now)
        self.make_quotes(customers, now)
        self.make_messages(customers, now)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(customers)} customers, {len(PACKAGES)} packages, {len(QUOTES)} quote requests and "
                f"{len(MESSAGES)} messages."
            )
        )
        self.stdout.write("Open http://localhost:5173/dashboard as a staff account.")
        self.stdout.write("Run 'manage.py seed_demo --clear' to remove it all again.")

    @transaction.atomic
    def seed_account(self, email, fresh=False):
        """Put one shipment of each kind on an existing account.

        For looking at the customer's own pages ("Mijn zendingen", Track &
        Trace) with something in them, logged in as that customer.
        """
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f"No account with the e-mail address {email}.") from None

        # This account's earlier test shipments, if any. Only ever the
        # PLSM-DEMO- ones: the account's real shipments are never touched.
        existing = Package.objects.filter(
            user=user, tracking_number__startswith=TRACKING_PREFIX
        )
        if existing.exists():
            if not fresh:
                raise CommandError(
                    f"{email} already has test shipments. Add --fresh to "
                    "replace them, or run 'seed_demo --clear' to remove all "
                    "demo data."
                )
            removed, _ = existing.delete()
            self.stdout.write(f"Removed {removed} earlier test shipment(s).")

        # Tracking numbers per account, so two accounts can both have them,
        # and well clear of the 1000s the demo customers use. Room for 100.
        base = 20000 + user.pk * 100
        numbers = [
            f"{TRACKING_PREFIX}{base + index}" for index in range(len(ACCOUNT_PACKAGES))
        ]

        now = timezone.now()

        def moment(days_ago, hour, minute):
            """`days_ago` days back, at a set time of day."""
            if days_ago is None:
                return None
            return (now - timedelta(days=days_ago)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )

        for index, (description, status, created, shipped, delivered) in enumerate(
            ACCOUNT_PACKAGES
        ):
            package = Package.objects.create(
                user=user,
                delivery_address=user.default_address,
                tracking_number=numbers[index],
                description=description,
                status=status,
                shipped_at=moment(shipped, 16, 30),
                delivered_at=moment(delivered, 11, 15),
                estimated_arrival=(
                    None
                    if status == Package.Status.DELIVERED
                    else (now + timedelta(days=21 - created)).date()
                ),
            )
            # Set on insert, so rewritten to tell the right story. A spread
            # of office-hours times (09:00-17:59), different for each row.
            Package.objects.filter(pk=package.pk).update(
                created_at=moment(created, 9 + index % 9, (5 + index * 7) % 60)
            )

        counts = {}
        for _, status, *_rest in ACCOUNT_PACKAGES:
            counts[status.label] = counts.get(status.label, 0) + 1
        summary = ", ".join(f"{n} {label.lower()}" for label, n in counts.items())
        self.stdout.write(
            self.style.SUCCESS(
                f"Added {len(ACCOUNT_PACKAGES)} test shipments to {user.email}: "
                f"{summary}."
            )
        )
        self.stdout.write("Log in as that account and open My account to see them.")
        self.stdout.write("Run 'manage.py seed_demo --clear' to remove them again.")

    def make_customers(self, now):
        customers = []

        for index, (first, last, phone, country, street, number, city) in enumerate(
            CUSTOMERS
        ):
            email = demo_address(first, last)

            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=first,
                last_name=last,
                phone_number=phone,
                # Known, unusable in production, and the same for every demo
                # account. These exist to be looked at, not logged into.
                password="demo-password-not-secret",
            )

            # date_joined is set on insert, so it is rewritten rather than
            # passed in — the overview counts "joined in the last 30 days".
            joined = now - timedelta(days=index * 9 + 3, hours=index * 5)
            User.objects.filter(pk=user.pk).update(date_joined=joined)

            Address.objects.create(
                user=user,
                label="Thuis",
                street=street,
                house_number=number,
                city=city,
                country=country,
                is_default=True,
            )

            customers.append(user)

        return customers

    def make_packages(self, customers, now):
        for index, (description, status, weight, value, days) in enumerate(PACKAGES):
            customer = customers[index % len(customers)]
            created = now - timedelta(days=days, hours=index * 3)

            package = Package.objects.create(
                user=customer,
                delivery_address=customer.default_address,
                tracking_number=f"{TRACKING_PREFIX}{1000 + index}",
                description=description,
                status=status,
                weight_kg=weight,
                value_eur=value,
                # Set here rather than derived, so the dates tell a consistent
                # story with the status each row is in.
                shipped_at=(
                    created + timedelta(days=2)
                    if status
                    in {
                        Package.Status.IN_TRANSIT,
                        Package.Status.ARRIVED,
                        Package.Status.DELIVERED,
                    }
                    else None
                ),
                delivered_at=(
                    created + timedelta(days=9)
                    if status == Package.Status.DELIVERED
                    else None
                ),
                # Shown on the public tracking page. Left empty for the two
                # earliest stages, so the "not known yet" state is visible in
                # the demo data as well as the filled-in one.
                estimated_arrival=(
                    None
                    if status in {Package.Status.QUOTED, Package.Status.CANCELLED}
                    else (created + timedelta(days=21)).date()
                ),
            )

            Package.objects.filter(pk=package.pk).update(created_at=created)

    def make_quotes(self, customers, now):
        for index, (destination, status, message, days) in enumerate(QUOTES):
            customer = customers[index % len(customers)]
            created = now - timedelta(days=days, hours=index * 2)

            quote = QuoteRequest.objects.create(
                destination=destination,
                first_name=customer.first_name,
                last_name=customer.last_name,
                email=customer.email,
                message=message,
                status=status,
                language="en" if message.startswith(("Good", "Please", "Do ")) else "nl",
            )

            QuoteRequest.objects.filter(pk=quote.pk).update(created_at=created)

    def make_messages(self, customers, now):
        for index, (subject, body, handled, days) in enumerate(MESSAGES):
            customer = customers[index % len(customers)]
            created = now - timedelta(days=days, hours=index * 4)

            message = ContactMessage.objects.create(
                name=customer.get_full_name(),
                email=customer.email,
                subject=subject,
                message=body,
                handled=handled,
                language="en" if subject.startswith("Question") else "nl",
            )

            ContactMessage.objects.filter(pk=message.pk).update(created_at=created)
