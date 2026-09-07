"""The Celery application.

Imported by config/__init__.py so that `app` exists as soon as Django is
imported, which is what lets `@shared_task` in an app module find a broker
without every module having to import this one.

Run a worker with:

    celery -A config worker --loglevel=info

With no CELERY_BROKER_URL set there is nothing to run — see the Celery section
of config/settings.py, where tasks fall back to running inline.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")

# Settings are read from Django, namespaced: every CELERY_* setting in
# settings.py becomes a Celery option. One place to configure, and it goes
# through the same .env loading as everything else.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Finds tasks.py in each installed app, so a new task needs no registration.
app.autodiscover_tasks()
