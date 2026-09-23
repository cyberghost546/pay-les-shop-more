"""The shops API.

Two things are worth pinning down. The public list is public and narrow - it
must not leak hidden shops or the office's own fields. And the write half is
staff-only, which is the whole security story for a table that decides what a
public page links to.
"""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .models import Shop

User = get_user_model()

# The smallest thing that is really a PNG, so the upload path is exercised
# without checking in a picture.
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"
)


def png(name="logo.png"):
    return SimpleUploadedFile(name, PNG_BYTES, content_type="image/png")


class PublicShopTests(TestCase):
    def setUp(self):
        Shop.objects.all().delete()
        self.visible = Shop.objects.create(
            name="Zalando", url="https://www.zalando.nl/", sort_order=10
        )
        self.hidden = Shop.objects.create(
            name="Retired Shop", url="https://example.com/", is_active=False
        )

    def test_lists_only_active_shops(self):
        response = self.client.get(reverse("shop-list"))

        self.assertEqual(response.status_code, 200)
        names = [row["name"] for row in response.json()]
        self.assertEqual(names, ["Zalando"])

    def test_does_not_expose_the_office_only_fields(self):
        response = self.client.get(reverse("shop-list"))

        # sort_order and is_active are how the office arranges the page. A
        # visitor has no use for them and no business reading them.
        self.assertEqual(
            set(response.json()[0]),
            {"id", "name", "url", "logo", "description"},
        )

    def test_a_shop_without_a_logo_reports_none_rather_than_a_broken_link(self):
        response = self.client.get(reverse("shop-list"))
        self.assertIsNone(response.json()[0]["logo"])

    def test_serves_a_logo_and_labels_it_by_extension(self):
        self.visible.logo = png()
        self.visible.save()

        response = self.client.get(reverse("shop-logo", args=[self.visible.pk]))

        self.assertEqual(response.status_code, 200)
        # Not guessed from the uploaded name: the model's fixed map decides.
        self.assertEqual(response["Content-Type"], "image/png")

    def test_will_not_serve_a_hidden_shops_logo(self):
        self.hidden.logo = png()
        self.hidden.save()

        response = self.client.get(reverse("shop-logo", args=[self.hidden.pk]))
        self.assertEqual(response.status_code, 404)


class StaffShopTests(TestCase):
    def setUp(self):
        Shop.objects.all().delete()
        self.staff = User.objects.create_user(
            username="office@example.com",
            email="office@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            username="customer@example.com",
            email="customer@example.com",
            password="a-long-enough-password",
        )
        self.shop = Shop.objects.create(name="IKEA", url="https://www.ikea.com/nl/nl/")

    def test_a_customer_cannot_read_the_dashboard_list(self):
        self.client.force_login(self.customer)
        response = self.client.get("/api/staff/shops/")
        self.assertEqual(response.status_code, 403)

    def test_a_customer_cannot_add_a_shop(self):
        self.client.force_login(self.customer)
        response = self.client.post(
            "/api/staff/shops/", {"name": "Bad", "url": "https://example.com/"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Shop.objects.filter(name="Bad").exists())

    def test_signed_out_cannot_add_a_shop(self):
        response = self.client.post(
            "/api/staff/shops/", {"name": "Bad", "url": "https://example.com/"}
        )
        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(Shop.objects.filter(name="Bad").exists())

    def test_staff_see_hidden_shops_too(self):
        Shop.objects.create(name="Hidden", url="https://example.com/", is_active=False)
        self.client.force_login(self.staff)

        response = self.client.get("/api/staff/shops/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Hidden", [row["name"] for row in response.json()])

    def test_staff_can_add_a_shop_with_a_logo(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            "/api/staff/shops/",
            {"name": "Coolblue", "url": "https://www.coolblue.nl/", "logo": png()},
        )

        self.assertEqual(response.status_code, 201, response.content)
        added = Shop.objects.get(name="Coolblue")
        self.assertTrue(added.logo)
        # Read back as where to find it, never as the file itself.
        self.assertEqual(response.json()["logo_url"], f"/shops/{added.pk}/logo/")

    def test_staff_can_reorder_and_hide(self):
        self.client.force_login(self.staff)

        response = self.client.patch(
            f"/api/staff/shops/{self.shop.pk}/",
            {"sort_order": 5, "is_active": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.sort_order, 5)
        self.assertFalse(self.shop.is_active)

    def test_staff_can_delete_a_shop(self):
        self.client.force_login(self.staff)

        response = self.client.delete(f"/api/staff/shops/{self.shop.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Shop.objects.filter(pk=self.shop.pk).exists())

    def test_refuses_a_logo_that_is_not_an_image(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            "/api/staff/shops/",
            {
                "name": "Dodgy",
                "url": "https://example.com/",
                "logo": SimpleUploadedFile(
                    "payload.svg", b"<svg onload=alert(1)>", content_type="image/svg+xml"
                ),
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("logo", response.json())
        self.assertFalse(Shop.objects.filter(name="Dodgy").exists())

    def test_refuses_a_logo_that_is_too_large(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            "/api/staff/shops/",
            {
                "name": "Huge",
                "url": "https://example.com/",
                "logo": SimpleUploadedFile(
                    "big.png", b"x" * (2 * 1024 * 1024 + 1), content_type="image/png"
                ),
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Shop.objects.filter(name="Huge").exists())

    def test_two_shops_cannot_share_a_name(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            "/api/staff/shops/", {"name": "IKEA", "url": "https://example.com/"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Shop.objects.filter(name="IKEA").count(), 1)


class ReorderTests(TestCase):
    """The dashboard's move buttons, which send the whole running order."""

    def setUp(self):
        Shop.objects.all().delete()
        self.staff = User.objects.create_user(
            username="office@example.com",
            email="office@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        self.first = Shop.objects.create(name="Alpha", url="https://a.example/")
        self.second = Shop.objects.create(name="Beta", url="https://b.example/")
        self.third = Shop.objects.create(name="Gamma", url="https://c.example/")
        self.client.force_login(self.staff)

    def order(self):
        return [shop.name for shop in Shop.objects.all()]

    def test_renumbers_into_the_order_it_is_sent(self):
        response = self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [self.third.pk, self.first.pk, self.second.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.order(), ["Gamma", "Alpha", "Beta"])

    def test_leaves_gaps_so_a_row_can_be_slipped_in_by_hand(self):
        self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [self.third.pk, self.first.pk, self.second.pk]},
            content_type="application/json",
        )

        self.assertEqual(
            list(Shop.objects.values_list("sort_order", flat=True)), [0, 10, 20]
        )

    def test_works_when_every_shop_starts_on_the_same_number(self):
        # The case that defeats swapping a pair: two rows at 0 swap to two
        # rows at 0, and nothing moves.
        Shop.objects.update(sort_order=0)

        self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [self.second.pk, self.third.pk, self.first.pk]},
            content_type="application/json",
        )

        self.assertEqual(self.order(), ["Beta", "Gamma", "Alpha"])

    def test_refuses_a_partial_list(self):
        response = self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [self.first.pk, self.second.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        # Nothing moved: the whole thing is refused rather than half applied.
        self.assertEqual(self.order(), ["Alpha", "Beta", "Gamma"])

    def test_refuses_an_empty_list(self):
        response = self.client.post(
            "/api/staff/shops/reorder/", {"ids": []}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_a_customer_cannot_reorder_the_services_page(self):
        customer = User.objects.create_user(
            username="customer@example.com",
            email="customer@example.com",
            password="a-long-enough-password",
        )
        self.client.force_login(customer)

        response = self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [self.third.pk, self.second.pk, self.first.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.order(), ["Alpha", "Beta", "Gamma"])

    def test_refuses_an_id_that_is_not_a_number(self):
        # A bad id is a bad request, not a 500.
        for bad in (["one", "two", "three"], [{"pk": 1}], [None], [[1]]):
            with self.subTest(ids=bad):
                response = self.client.post(
                    "/api/staff/shops/reorder/",
                    {"ids": bad},
                    content_type="application/json",
                )

                self.assertEqual(response.status_code, 400)
                self.assertIn("ids", response.json())
                self.assertEqual(self.order(), ["Alpha", "Beta", "Gamma"])

    def test_refuses_a_boolean_dressed_up_as_an_id(self):
        # bool subclasses int in Python, so True would otherwise pass for 1.
        response = self.client.post(
            "/api/staff/shops/reorder/",
            {"ids": [True, self.second.pk, self.third.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.order(), ["Alpha", "Beta", "Gamma"])

    def test_refuses_ids_that_are_not_a_list(self):
        for bad in ("1,2,3", {"a": 1}, 7, None):
            with self.subTest(ids=bad):
                response = self.client.post(
                    "/api/staff/shops/reorder/",
                    {"ids": bad},
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 400)
