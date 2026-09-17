// Checks that the hostnames this repository hard-codes still agree.
//
//     node scripts/check-origins.mjs
//
// There is no single place that says where the site lives. The public origin
// is written out in the prerenderer's route table, again in the hook that
// sets a page's canonical link, and three more times in index.html's social
// card tags; where /api goes is in vercel.json; what Django will accept a
// cross-origin POST from is in render.yaml. Five files, and nothing makes
// them move together.
//
// The failure they produce is not a build error. The build is green, the site
// loads, and then a form POST is refused as a CSRF failure, or a link shared
// to WhatsApp previews the old domain. Both get reported days later by
// somebody who cannot say what changed. This is cheaper.
//
// No dependencies on purpose: this runs in CI before `npm ci` would have
// installed anything, and reading five files does not need a YAML parser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const problems = [];
const notes = [];

const fail = (file, message) => problems.push({ file, message });

function report() {
  for (const note of notes) console.log(`  ${note}`);

  if (problems.length === 0) {
    console.log('\norigins agree.');
    process.exit(0);
  }

  console.error(`\n${problems.length} problem(s):\n`);
  for (const { file, message } of problems) console.error(`  ${file}: ${message}`);
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The canonical public origin, taken from the route table.
//
// routes.js is the source of truth rather than one opinion among five: the
// sitemap and every prerendered canonical link are generated from it, so if
// it is wrong the wrongness is already published.
// ---------------------------------------------------------------------------

const routes = read('frontend/scripts/routes.js');
const canonical = routes.match(/url:\s*'([^']+)'/)?.[1];

if (!canonical) {
  fail('frontend/scripts/routes.js', 'no SITE.url found - this file defines the canonical origin');
  report();
}

if (canonical.endsWith('/')) {
  fail(
    'frontend/scripts/routes.js',
    `SITE.url has a trailing slash (${canonical}); every consumer joins paths onto it`
  );
}

notes.push(`canonical origin: ${canonical}`);

// ---------------------------------------------------------------------------
// The second copy: usePageMeta's SITE_URL, used for the canonical <link> the
// client-side router writes on navigation. A mismatch here means a prerendered
// page and the same page reached by clicking claim different canonical URLs -
// the version of this bug a search engine notices and a human does not.
// ---------------------------------------------------------------------------

const hook = read('frontend/src/hooks/usePageMeta.js');
const hookUrl = hook.match(/SITE_URL\s*=\s*'([^']+)'/)?.[1];

if (!hookUrl) {
  fail('frontend/src/hooks/usePageMeta.js', 'no SITE_URL found');
} else if (hookUrl !== canonical) {
  fail(
    'frontend/src/hooks/usePageMeta.js',
    `SITE_URL is ${hookUrl}, but routes.js says ${canonical}`
  );
}

// ---------------------------------------------------------------------------
// The social card tags in index.html. These are absolute by necessity - a
// scraper does not resolve relative URLs - so they are copies, and copies of a
// hostname are what this script exists for.
// ---------------------------------------------------------------------------

const html = read('frontend/index.html');

for (const [, property, value] of html.matchAll(
  /<meta\s+(?:property|name)="((?:og|twitter):[a-z:]+)"\s+content="(https?:\/\/[^"]+)"/g
)) {
  if (value !== canonical && !value.startsWith(`${canonical}/`)) {
    fail('frontend/index.html', `${property} points at ${value}, not ${canonical}`);
  }
}

// ---------------------------------------------------------------------------
// vercel.json: where /api actually goes, and whether the SPA fallback is still
// behind it.
//
// Order matters and is easy to break. The fallback rewrites everything to
// index.html; if it is ever listed first, /api requests are answered with the
// React shell and the app sees HTML where it expected JSON.
// ---------------------------------------------------------------------------

const vercel = JSON.parse(read('vercel.json'));
const rewrites = vercel.rewrites ?? [];

const apiIndex = rewrites.findIndex((rule) => rule.source.startsWith('/api'));
const fallbackIndex = rewrites.findIndex((rule) => rule.destination === '/index.html');

if (apiIndex === -1) {
  fail(
    'vercel.json',
    'no /api rewrite - the browser would hit Vercel for API calls and get the SPA shell'
  );
} else {
  const { destination } = rewrites[apiIndex];

  if (!destination.startsWith('https://')) {
    fail(
      'vercel.json',
      `the /api rewrite goes to ${destination}; it must be https, or the hop in front of Django is plain text`
    );
  }

  if (/localhost|127\.0\.0\.1/.test(destination)) {
    fail('vercel.json', `the /api rewrite points at ${destination} - a development target, committed by accident`);
  }

  // The capture group has to be carried through, or every API path collapses
  // onto one upstream URL.
  if (!destination.endsWith('/api/$1')) {
    fail(
      'vercel.json',
      `the /api rewrite ends "${destination.slice(-12)}"; it must end /api/$1 so the path is preserved`
    );
  }

  if (fallbackIndex !== -1 && fallbackIndex < apiIndex) {
    fail('vercel.json', 'the SPA fallback is listed before the /api rewrite, so it swallows every API call');
  }

  if (destination.startsWith('https://')) {
    notes.push(`/api rewrite -> ${new URL(destination).origin}`);
  }
}

if (fallbackIndex === -1) {
  fail('vercel.json', 'no /index.html fallback - a deep link refreshed in the browser would 404');
}

// ---------------------------------------------------------------------------
// render.yaml: the origin Django is told the site is served from. settings.py
// feeds it to both CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS, so a stale
// value here is a login form that answers 403 and explains nothing.
//
// Two values are accepted rather than one, and the reason is not indecision.
// The canonical origin above is where the site says it lives; the Vercel
// deployment URL is where it is actually served from today, because the
// domain is still answered by the older PHP site. Django has to trust the
// origin a browser really arrives from, which is the second one.
//
// When the domain is moved onto this deployment, delete the second entry.
// That is what turns this check from a spell-check into a real assertion.
// ---------------------------------------------------------------------------

const ACCEPTED_FRONTEND_ORIGINS = [canonical, 'https://pay-les-shop-more.vercel.app'];

const renderYaml = read('render.yaml');
const frontendUrl = renderYaml.match(/key:\s*DJANGO_FRONTEND_URL\s*\n\s*value:\s*(\S+)/)?.[1];

if (!frontendUrl) {
  fail('render.yaml', 'no DJANGO_FRONTEND_URL - without it Django refuses the site\'s own POSTs as CSRF failures');
} else if (!ACCEPTED_FRONTEND_ORIGINS.includes(frontendUrl)) {
  fail(
    'render.yaml',
    `DJANGO_FRONTEND_URL is ${frontendUrl}, which is none of: ${ACCEPTED_FRONTEND_ORIGINS.join(', ')}`
  );
} else if (frontendUrl !== canonical) {
  notes.push(
    `render.yaml points Django at ${frontendUrl}, not ${canonical} (allowed by ACCEPTED_FRONTEND_ORIGINS)`
  );
}

report();
