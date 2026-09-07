"""Makes the Celery app importable as soon as Django starts.

@shared_task looks for an app that has already been created; without this
import the invoicing tasks would have no broker attached when a worker or the
web process loads them.
"""

from .celery import app as celery_app

__all__ = ("celery_app",)
