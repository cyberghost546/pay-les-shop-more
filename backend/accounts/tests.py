"""Tests for the rules the models enforce."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from .models import Address, Package

User = get_user_model()


class UserModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="jdoe",
            first_name="Jan",
            last_name="Doe",
            email="jan@example.com",
            phone_number="+599 9 123 4567",
            password="a-long-enough-password",
        )

    def test_password_is_hashed_not_stored(self):
        self.assertNotEqual(self.user.password, "a-long-enough-password")
        self.assertTrue(self.user.check_password("a-long-enough-password"))

    def test_email_must_be_unique(self):
        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                username="other",
                email="jan@example.com",
                phone_number="+599 9 000 0000",
                password="another-long-password",
            )


class AddressModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="jdoe",
            email="jan@example.com",
            phone_number="+599 9 123 4567",
            password="a-long-enough-password",
        )

    def test_user_can_have_several_addresses(self):
        Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        Address.objects.create(
            user=self.user, street="Schottegatweg", house_number="5", city="Willemstad"
        )
        self.assertEqual(self.user.addresses.count(), 2)

    def test_first_address_becomes_the_default(self):
        first = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        self.assertTrue(first.is_default)
        self.assertEqual(self.user.default_address, first)

    def test_setting_a_new_default_clears_the_old_one(self):
        first = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        second = Address.objects.create(
            user=self.user,
            street="Schottegatweg",
            house_number="5",
            city="Willemstad",
            is_default=True,
        )

        first.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(second.is_default)
        self.assertEqual(self.user.addresses.filter(is_default=True).count(), 1)

    def test_addresses_belong_to_one_customer_each(self):
        other = User.objects.create_user(
            username="other",
            email="other@example.com",
            phone_number="+599 9 000 0000",
            password="another-long-password",
        )
        Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )
        Address.objects.create(
            user=other, street="Kaya Grandi", house_number="2", city="Kralendijk"
        )

        self.assertEqual(self.user.addresses.count(), 1)
        self.assertEqual(other.addresses.count(), 1)


class PackageModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="jdoe",
            email="jan@example.com",
            phone_number="+599 9 123 4567",
            password="a-long-enough-password",
        )
        self.address = Address.objects.create(
            user=self.user, street="Hertzstraat", house_number="10", city="Berkel"
        )

    def test_shipment_keeps_its_address_after_the_address_is_deleted(self):
        """Shipment history must survive an address being removed."""
        package = Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-0001",
        )
        self.assertIn("Hertzstraat 10", package.delivery_address_text)

        self.address.delete()

        package.refresh_from_db()
        self.assertIsNone(package.delivery_address)
        self.assertIn("Hertzstraat 10", package.delivery_address_text)

    def test_editing_an_address_does_not_rewrite_past_shipments(self):
        package = Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-0001",
        )

        self.address.street = "Nieuwestraat"
        self.address.save()

        package.refresh_from_db()
        self.assertIn("Hertzstraat 10", package.delivery_address_text)

    def test_tracking_number_must_be_unique(self):
        Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-0001",
        )
        with self.assertRaises(IntegrityError):
            Package.objects.create(
                user=self.user,
                delivery_address=self.address,
                tracking_number="PLSM-0001",
            )

    def test_deleting_a_customer_removes_their_packages(self):
        Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-0001",
        )
        self.user.delete()
        self.assertEqual(Package.objects.count(), 0)
