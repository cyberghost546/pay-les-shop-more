"""Test helpers shared across the apps."""

from django.core.cache import cache
from rest_framework.test import APITestCase


class ThrottleFreeAPITestCase(APITestCase):
    """An APITestCase that starts each test with the throttle counters empty.

    DRF keeps those counters in the cache, which is not part of the database
    and so is not rolled back between tests — it is shared by the whole run.
    Without this, adding one more test to a throttled endpoint makes some
    other test fail with a 429 for reasons that have nothing to do with what
    it is checking.
    """

    def setUp(self):
        super().setUp()
        cache.clear()
