"""The health and readiness endpoints.

Worth testing for the same reason they exist: whatever is watching the
deployment believes them. A readiness check that answers 200 while the
database is unreachable keeps a broken instance in the load balancer, which is
strictly worse than having no check at all.
"""

from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.urls import reverse


class HealthTests(SimpleTestCase):
    """SimpleTestCase: liveness must not need a database, and this fails if it
    ever quietly starts using one."""

    def test_answers_ok(self):
        response = self.client.get(reverse('health'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_is_not_cached(self):
        # A cached 200 outlives the process it described.
        response = self.client.get(reverse('health'))

        self.assertIn('no-cache', response.headers.get('Cache-Control', ''))

    def test_needs_no_login(self):
        # Stated as a test because it is a deliberate exposure, not an
        # oversight: a probe has no credentials to offer.
        self.assertEqual(self.client.get(reverse('health')).status_code, 200)

    def test_describes_nothing_about_the_deployment(self):
        body = self.client.get(reverse('health')).json()

        # No version, no settings, no hostnames. This is the most reliably
        # unauthenticated URL on the site.
        self.assertEqual(list(body), ["status"])


class ReadyTests(TestCase):
    def test_reports_every_dependency_when_healthy(self):
        response = self.client.get(reverse('ready'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "checks": {"database": "ok", "cache": "ok"}},
        )

    def test_fails_with_503_when_the_database_is_unreachable(self):
        with patch('config.health.connection.cursor', side_effect=OSError('down')):
            response = self.client.get(reverse('ready'))

        # The status line is the part a load balancer reads.
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['checks']['database'], 'error')

    def test_fails_with_503_when_the_cache_is_unreachable(self):
        with patch('config.health.cache.set', side_effect=OSError('down')):
            response = self.client.get(reverse('ready'))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['checks']['cache'], 'error')

    def test_reports_a_cache_that_answers_wrongly_as_an_error(self):
        # A cache that accepts writes and returns nothing is not an exception
        # anywhere; it is just quietly useless, and throttling depends on it.
        with patch('config.health.cache.get', return_value=None):
            response = self.client.get(reverse('ready'))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['checks']['cache'], 'error')

    def test_keeps_the_failure_detail_out_of_the_response(self):
        with patch(
            'config.health.connection.cursor',
            side_effect=OSError('could not connect to db.internal:5432'),
        ):
            response = self.client.get(reverse('ready'))

        # The traceback belongs in the logs, which are already behind a login.
        self.assertNotIn('db.internal', response.content.decode())
