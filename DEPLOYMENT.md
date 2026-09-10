# Deploying PayLesShopMore

Two things are deployed, and they are independent of each other:

- **The API.** Django, run under gunicorn. It owns the database, the invoice
  PDFs and the customer uploads.
- **The site.** The React build in `frontend/dist`, which is static files and
  can be served by anything.

They must end up on the same origin, with `/api` reaching Django and
everything else reaching the static files. That is what makes the session
cookie first-party, and it is the reason `connect-src 'self'` in the content
security policy is enough. It is also no longer optional: Safari blocks
third-party cookies and Firefox partitions them, so a session cookie on a
different origin from the site is discarded before it is ever sent back.

**Deploying the site to Vercel?** See `VERCEL_DEPLOYMENT.md`, which is this
document with the static half on Vercel and a rewrite in front of Django.

## Before the first deploy

Set the environment variables. `backend/.env.example` lists every one of them
with what it does; these are the ones without which the site does not work:

| Variable | Why |
| --- | --- |
| `DJANGO_SECRET_KEY` | Signs sessions and password-reset tokens. Django refuses to start without it when `DJANGO_DEBUG` is off. |
| `DJANGO_ALLOWED_HOSTS` | The hostnames Django will answer for. |
| `DJANGO_CORS_ORIGINS`, `DJANGO_CSRF_ORIGINS` | The origin the React app is served from. |
| `DATABASE_URL` | The whole connection in one string, which is what a hosted PostgreSQL hands you. The separate `POSTGRES_*` variables still work. Without either, and with `DJANGO_DEBUG` off, Django refuses to start rather than quietly falling back to SQLite. |
| `AWS_STORAGE_BUCKET_NAME` | Where invoice PDFs and quote attachments are kept. Without it they go to the local disk, which is only safe on a host with a persistent volume and exactly one web process. The bucket must be private: the files are streamed by views that check who is asking. |
| `EMAIL_*`, `DJANGO_FROM_EMAIL` | Password-reset mail. Unset means no reset link ever arrives. |
| `DJANGO_FRONTEND_URL` | The absolute URL used to build that reset link. |
| `CELERY_BROKER_URL` | Where invoice rendering is queued. Unset means it happens inside the approval request. |
| `REDIS_URL` | The shared cache. Unset means each worker counts API rate limits separately. |
| `SENTRY_DSN` | Optional, and the difference between knowing an invoice failed to render and not. |

Never set `DJANGO_DEBUG` in production. It is off unless something turns it
on, and turning it on serves the source of any page that raises.

## The API

```sh
cd backend
pip install -r requirements-prod.txt      # plus gunicorn, psycopg, redis, sentry, django-storages
python manage.py migrate
python manage.py collectstatic --noinput  # the admin's own CSS, served by WhiteNoise
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3
```

Run the Celery worker beside it, as its own process:

```sh
celery -A config worker --loglevel=info
```

Without a worker and with `CELERY_BROKER_URL` set, an approved invoice is
queued and never rendered. Without `CELERY_BROKER_URL` at all, tasks run
inline instead, which works and makes the reviewer wait for the PDF.

Check the deployment's own configuration before trusting it:

```sh
python manage.py check --deploy
```

## The site

```sh
cd frontend
npm ci
npm run build
```

`dist` is what gets served. The build writes a directory with an `index.html`
in it for each public route, so `/destinations/curacao` is a real file with its
own title, description and link preview. Serve those files directly and fall
back to `dist/index.html` for anything unmatched, which is what a static host
does by default.

`dist/sitemap.xml` is generated from `frontend/scripts/routes.js`. Adding a
public page means adding it there, not editing the XML.

The photographs are generated separately and committed:

```sh
npm run images     # only after changing a source photograph in src/images
```

## Health checks

| Path | Question | Use it for |
| --- | --- | --- |
| `/api/health/` | Is the process alive? | The orchestrator's liveness probe. Touches nothing, so a database outage cannot make it restart healthy web processes. |
| `/api/ready/` | Can it serve a request? | The load balancer. Checks the database and the cache, and answers `503` when either is unreachable. |

Both are public and deliberately say nothing about the deployment.

## Watching it run

Everything is logged to stdout as one line per event, which is what a
container platform collects. `DJANGO_LOG_LEVEL` sets the volume. `django.request`
logs every 4xx and 5xx with its traceback.

With `SENTRY_DSN` set, unhandled exceptions are reported. Personally
identifying data is deliberately not sent: an invoice error does not need the
customer's address to be actionable.

## What runs on every push

`.github/workflows/ci.yml` runs the Django suite, the deployment checks, a
check for models changed without a migration, then the frontend's lint, tests
and build. It does not deploy anything.
