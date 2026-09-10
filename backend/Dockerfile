# The API image: Django under gunicorn, and the Celery worker that renders
# invoices. One image, two start commands — the worker has to run the same
# code as the web process or a task queued by one is unknown to the other.
#
# Built by Railway from backend/ as the root directory. See the Railway
# section of VERCEL_DEPLOYMENT.md.

FROM python:3.12-slim

# Never write .pyc files into a container layer, and never buffer stdout: the
# platform collects logs from stdout, and a buffered crash log arrives after
# the process that would have flushed it has gone.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements first, and on their own layer. Docker caches per instruction,
# so this layer is reused on every build that does not change a dependency —
# which is almost all of them, and is the difference between a ten second
# deploy and a two minute one.
COPY requirements.txt requirements-prod.txt ./
RUN pip install -r requirements-prod.txt

COPY . .

# The admin's own CSS and JavaScript, compressed and hashed by WhiteNoise so
# they can be cached forever and a deploy still invalidates them.
#
# The environment variables here exist only to let settings.py import. With
# DJANGO_DEBUG off it refuses to start without a secret key and a database,
# deliberately — a production process that reached the SQLite fallback would
# serve an empty database from a disk that disappears at the next restart.
# collectstatic opens no connection, so this URL is never dialled and the
# key never signs anything: both are replaced by the real ones at runtime.
RUN DJANGO_DEBUG=0 \
    DJANGO_SECRET_KEY=build-time-only-never-used-to-sign-anything \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    python manage.py collectstatic --noinput

# Not root. A bug that gets as far as running code should not also get to
# write to the image.
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app

EXPOSE 8000

# Migrations run here rather than in a separate release step, because Railway
# has no release phase that is guaranteed to finish before traffic arrives.
# Django takes a lock in Postgres for the duration, so a second replica
# starting at the same moment waits rather than applying the same migration
# twice.
#
# The worker service overrides this with:
#   celery -A config worker --loglevel=info
#
# Logs to stdout, both access and error, because that is what the platform
# collects. Shell form on purpose: ${PORT} has to be expanded at runtime, and
# exec form would pass it to gunicorn as the literal string.
CMD python manage.py migrate --noinput && \
    exec gunicorn config.wsgi:application \
      --bind "0.0.0.0:${PORT:-8000}" \
      --workers "${WEB_CONCURRENCY:-3}" \
      --timeout 60 \
      --access-logfile - \
      --error-logfile -
