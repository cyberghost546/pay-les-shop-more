# Deploying to Vercel

## What Vercel deploys, and what it does not

Vercel serves the React site. It does not run the API.

That is not a limitation worth fighting. This project's backend is Django with
a Celery worker, a PostgreSQL database and a store of invoice PDFs that must
still be there tomorrow. A Vercel function is a short-lived process with a
disposable filesystem and no way to keep a worker alive, so putting Django
there would mean giving up background rendering, losing every uploaded file at
the next deploy, and opening a fresh database connection per request. The
application would have to be rewritten to lose features it already has.

So the shape is:

| Piece | Where | What runs |
| --- | --- | --- |
| The site | Vercel | `frontend/dist` — static files, one HTML file per public route |
| The API | A container host | `gunicorn config.wsgi:application` |
| The worker | The same host | `celery -A config worker` |
| The database | Managed PostgreSQL | Neon, Supabase, Railway, Render, RDS |
| The files | An S3-compatible bucket | Cloudflare R2, Backblaze B2, S3, Spaces |

Vercel then **rewrites `/api` to the API**, so the browser only ever talks to
one origin.

## Why the rewrite is required, not a convenience

Sign-in is a session cookie. If the site is on `paylesshopmore.com` and the API
answers on `api.paylesshopmore.com`, that cookie is third-party, and Safari
blocks third-party cookies outright while Firefox partitions them. Customers on
either browser would sign in successfully and be signed out by the next page
load.

The rewrite makes the API look like part of the site. The cookie is
first-party, `SameSite=Lax` works, and the `connect-src 'self'` line in the
content security policy in `frontend/index.html` is satisfied without loosening
it.

This is already the default. `frontend/src/api/client.js` calls `/api`, and
`config/settings.py` sets `SameSite=Lax`.

## The one line you must edit

`vercel.json` names the API. JSON has no comments, so it is called out here
instead:

```json
{ "source": "/api/:path*", "destination": "https://api.paylesshopmore.com/api/:path*" }
```

Replace that host with wherever your Django deployment answers. Everything else
in the file is correct as it stands.

Leave the `(.*)` alone while you are in there. The obvious spelling is
`/api/:path*`, and it is wrong: it does not match a path that ends in a
slash, so `/api/auth/login/` falls past it to the single-page fallback below
and the browser is handed the homepage HTML instead of reaching Django. Every
route this API has ends in a slash, because that is what DRF's router
generates, so the named-parameter form silently breaks all of them while
looking correct. `(.*)` captures the trailing slash and `$1` puts it back.

## Vercel project settings

Import the repository and leave the framework preset alone — `vercel.json`
already states the build explicitly:

| Setting | Value | Set by |
| --- | --- | --- |
| Framework preset | Other | `vercel.json` |
| Install command | `npm ci --prefix frontend` | `vercel.json` |
| Build command | `npm run build --prefix frontend` | `vercel.json` |
| Output directory | `frontend/dist` | `vercel.json` |
| Root directory | repository root | leave as-is |
| Node version | 22.x | `package.json` and `.nvmrc` |

No environment variables are needed on Vercel. The site talks to `/api`, and
which API that is comes from the rewrite. Set `VITE_API_BASE_URL` only if you
cannot use a rewrite — see the last section.

## Deploying the API to Railway

`backend/Dockerfile` and `backend/railway.json` are written for this. The health
check, the restart policy and the build are declared there, so the only things
left are the ones Railway cannot guess.

**Two services from the same repository, both with the root directory set to
`backend`.** They must run the same image: a task queued by the web process is
unknown to a worker running different code.

| Service | Start command | What it does |
| --- | --- | --- |
| `api` | leave empty, so the Dockerfile runs migrations then gunicorn | Answers requests |
| `worker` | `celery -A config worker --loglevel=info` | Renders invoice PDFs, sends notification e-mail |

**Add Postgres and Redis** from Railway's own catalogue, in the same project.
Both publish their connection strings as variables you reference rather than
copy, so a rotated password does not have to be chased across services:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
CELERY_BROKER_URL=${{Redis.REDIS_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

Set these, and every variable in the table below, on **both** services. The
worker needs the database and the broker exactly as much as the web process
does, and it sends the invoice e-mail, so it needs the mail settings too.

**Generate a domain** for the `api` service. Then set `DJANGO_ALLOWED_HOSTS` to
that hostname, and put the same hostname into the `/api` rewrite in
`vercel.json`.

**Do not set `PORT`.** Railway injects it and the Dockerfile reads it.

Migrations run at container start rather than in a release step, because
Railway has no release phase guaranteed to finish before traffic arrives.
Django holds a lock in Postgres while they run, so a second replica starting at
the same moment waits rather than applying the same migration twice.

Create the first administrator once the service is up, from Railway's shell:

```sh
python manage.py createsuperuser
```

## Environment variables on the API host

`backend/.env.example` documents all of them. These are the ones without which
the site does not work:

| Variable | Value | Why |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | 50 random characters | Signs sessions and reset tokens. Django refuses to start without it. |
| `DJANGO_ALLOWED_HOSTS` | `api.paylesshopmore.com` | The hostnames Django answers for. Railway's own probe and service hostnames are added automatically by `settings.py`; list only the public domain here. |
| `DJANGO_FRONTEND_URL` | `https://paylesshopmore.com` | Builds password-reset links, and is trusted for CORS and CSRF automatically. |
| `DATABASE_URL` | `postgres://...` | Without it, and with `DJANGO_DEBUG` off, startup fails rather than falling back to SQLite. |
| `AWS_STORAGE_BUCKET_NAME` | your bucket | Where invoice PDFs live. Without it they go to local disk. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | from the provider | |
| `AWS_S3_ENDPOINT_URL` | provider endpoint | Omit for Amazon S3; required for everyone else. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | from the provider | Password resets and invoice notifications. |
| `DJANGO_FROM_EMAIL` | `PayLesShopMore <noreply@example.com>` | |
| `CELERY_BROKER_URL` | `redis://...` | Where invoice rendering is queued. |
| `REDIS_URL` | `redis://.../1` | Shared cache. Without it each web process counts API rate limits separately, and the real limit becomes the configured rate times the number of processes. |
| `SENTRY_DSN` | optional | The difference between knowing an invoice failed to render and not. |

Generate the secret key with:

```sh
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Never set `DJANGO_DEBUG` in production. It is off unless something turns it on,
and turning it on serves the source of any page that raises.

## Database

Any managed PostgreSQL. Pass the URL the provider gives you as `DATABASE_URL`;
percent-encode any `@`, `/`, `:` or `#` in the password, or the parser will read
the password as part of the host.

TLS is required by default whenever `DJANGO_DEBUG` is off.
`DJANGO_DB_SSL_REQUIRE=0` turns it off, and there is no good reason to.

**If you connect through a transaction-mode pooler** — PgBouncer, or Supabase's
port 6543 — set `DJANGO_CONN_MAX_AGE=0`. Otherwise each process holds a
connection it can never reuse, and a burst of traffic exhausts the pool while
every process sits idle.

Run the migrations as part of each deploy, before the new processes start
taking traffic:

```sh
python manage.py migrate
python manage.py collectstatic --noinput
```

## File storage

Invoice PDFs and quote attachments must not live on the API container's disk.
Any S3-compatible bucket will do; set `AWS_STORAGE_BUCKET_NAME` and the keys and
nothing else changes, because both files are `FileField`s and go through
whichever storage backend is configured.

**The bucket must be private.** Every file in it is either an invoice carrying
a customer's name, address and shipment value, or something a stranger attached
to a quote request. Nothing is ever linked to directly: the files are streamed
by Django views that check who is asking. A public bucket makes that check
bypassable by anyone who can guess a filename, and the filenames contain
tracking numbers, which are sequential and printed on the label.

Install the production requirements so the backend is available:

```sh
pip install -r backend/requirements-prod.txt
```

## Authentication

Nothing to configure. Sessions are cookies, the cookie is `HttpOnly`, `Secure`
and `SameSite=Lax` in production, and passwords use Django's default hasher
with a twelve-character minimum.

`DJANGO_CROSS_SITE_COOKIES` exists and should stay off. See the top of this
document for what turning it on costs.

## Background work and cron

Nothing here runs on Vercel Cron, and `vercel.json` deliberately declares none:
the work is Django's, so it belongs beside Django on Railway. Three services,
one repository, one Dockerfile, three start commands.

| Service | Config-as-code path | What it is |
| --- | --- | --- |
| `plsm-api` | `railway.json` | gunicorn, and the migrations at start |
| `plsm-worker` | `railway.worker.json` | the Celery worker |
| `plsm-report` | `railway.cron.json` | the daily warehouse report |

Each is created the same way: Railway → New → GitHub Repo → this repository,
then in the service's Settings set **Root Directory** to `backend` and
**Config-as-code path** to the file in the table. Each file's own `"//"` notes
list the variables that service needs.

### The worker

Two things run in the background, and both are triggered by something a person
did rather than by a clock:

- rendering an invoice PDF after it is approved
- sending the e-mail copy of a notification

```sh
celery -A config worker --loglevel=info
```

**Set `CELERY_BROKER_URL` on the web service only after the worker exists and
is consuming.** With a broker set and no worker, every `.delay()` is accepted,
queued and never run: invoices stay unrendered and the mail never arrives, with
no error anywhere. Add Redis to the Railway project, share its URL to both
services as `CELERY_BROKER_URL`, and deploy the worker first.

### The daily report

`warehouse/management/commands/send_warehouse_report.py` e-mails the office the
previous day's report with a CSV attached. It was written to run on a schedule
and said so in its docstring, but nothing ran it until `railway.cron.json`
existed — so before that it went out only when somebody typed it into a shell.

`0 6 * * *`, UTC, because Railway's scheduler has no timezone setting. That is
07:00 in Amsterdam in winter and 08:00 in summer; both are before the working
day, which is what matters. Its restart policy is `NEVER` on purpose — a cron
service is meant to exit, and restarting a failed run re-sends the report to
everyone it already reached.

If `CELERY_BROKER_URL` is unset, both run inline in the request instead. That
works and is the fallback a fresh clone uses; it makes whoever pressed Approve
wait for the PDF to be drawn.

If `CELERY_BROKER_URL` is set and no worker is running, an approved invoice is
queued and never rendered. It stays `APPROVED` with no document, which is
recoverable:

```sh
python manage.py rerender_invoices
```

## Payments

There is no payment provider integrated. "Paid" is a shipment status a member of
staff sets from the dashboard, and marking it is what raises the invoice. There
are no webhooks to point at a production URL.

## Deploying

1. Push the repository to GitHub.
2. Deploy the API and the worker to your container host, with the environment
   variables above. Run `migrate` and `collectstatic`.
3. Confirm the API is up: `curl https://your-api-host/api/health/` answers
   `{"status": "ok"}`, and `/api/ready/` answers `200` once the database and
   cache are reachable.
4. Edit the rewrite destination in `vercel.json` to that host. Commit.
5. Import the repository into Vercel and deploy. No environment variables
   needed.
6. Point `DJANGO_ALLOWED_HOSTS` at the API host and `DJANGO_FRONTEND_URL` at the
   Vercel domain, then restart the API.

## Testing the deployment

Against the Vercel URL, not the API host — the whole point is that the browser
only ever sees one origin.

1. **The site loads.** `/`, and `/destinations/curacao` typed directly into the
   address bar. The second is a prerendered file; if it 404s, the output
   directory is wrong.
2. **The API is reachable through the rewrite.** `/api/health/` on the Vercel
   domain answers `{"status": "ok"}`. If it does not, the rewrite destination is
   wrong and nothing below will work.
3. **Sign in**, then reload the page. Still signed in means the cookie is
   first-party. Try it in Safari as well as Chrome: Safari is where a
   misconfigured cross-origin setup fails and Chrome is where it does not.
4. **A customer sees their own invoices and downloads one.** The PDF opens.
5. **A customer cannot see anyone else's.** Signed in as one customer, request
   another customer's invoice id directly at `/api/invoices/<id>/`. It must be a
   404, not a 403 — the queryset never contains the row, so it does not exist as
   far as that session is concerned.
6. **Add an invoice by hand** from the dashboard: pick a customer, pick one of
   their shipments, upload a PDF. It appears on that customer's profile.
7. **The pairing is checked.** Submit the form with one customer's id and
   another customer's shipment id. It must be refused.
8. **A shipped order is locked.** Try to change a shipment that has already
   shipped. It must be refused with a 409, from the server, whatever the buttons
   do.
9. **A new order after shipping** creates a new shipment and leaves the shipped
   one untouched.
10. **Sign out**, then request a dashboard route. Bounced to login.

## If you cannot use a rewrite

Set `VITE_API_BASE_URL` on Vercel to the full API base, including `/api`, and
on the API host set `DJANGO_CROSS_SITE_COOKIES=1` and add the Vercel domain to
`DJANGO_CORS_ORIGINS` and `DJANGO_CSRF_ORIGINS`.

You will also have to loosen `connect-src` in the content security policy in
`frontend/index.html` to name the API origin, and customers using Safari will
not stay signed in. This is a downgrade, not an equivalent arrangement.

For preview deployments, whose hostnames cannot be listed in advance, set
`DJANGO_CORS_ORIGIN_REGEX` to an anchored pattern naming your project.
