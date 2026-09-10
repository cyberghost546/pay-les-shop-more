"""Liveness and readiness, for whatever is watching the deployment.

Two endpoints rather than one, because they answer different questions and a
platform does the wrong thing if they are conflated:

  /api/health/   Is this process alive? No dependencies are touched, so a
                 database outage does not make the orchestrator kill and
                 restart web processes that are working correctly.

  /api/ready/    Can this process serve a real request? Checks the database
                 and the cache, so a load balancer can take an instance out
                 of rotation while it cannot reach them.

Both are public and both are deliberately boring: no version numbers, no
settings, no dependency hostnames. A health endpoint is the most reliably
unauthenticated URL on any site, so it must not describe the deployment to
whoever finds it.
"""

import logging

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache

logger = logging.getLogger(__name__)


@never_cache
def health(_request):
    """Liveness. Answers as long as Python is running and can route a URL."""
    return JsonResponse({"status": "ok"})


@never_cache
def ready(_request):
    """Readiness. Confirms the backing services actually answer."""
    checks = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except Exception:
        # Logged with the traceback, reported as one word. The detail belongs
        # in the logs, where it is already behind authentication.
        logger.exception("Readiness check failed: database")
        checks["database"] = "error"

    try:
        cache.set("healthcheck", "ok", 10)
        checks["cache"] = "ok" if cache.get("healthcheck") == "ok" else "error"
    except Exception:
        logger.exception("Readiness check failed: cache")
        checks["cache"] = "error"

    healthy = all(value == "ok" for value in checks.values())

    # 503, not 200 with a body saying otherwise: a load balancer reads the
    # status line and nothing else.
    return JsonResponse(
        {"status": "ok" if healthy else "degraded", "checks": checks},
        status=200 if healthy else 503,
    )
