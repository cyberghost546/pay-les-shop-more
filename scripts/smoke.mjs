// Asks a deployed site the questions a browser would.
//
//     node scripts/smoke.mjs                       # the production origin
//     node scripts/smoke.mjs https://staging.example
//
// Read-only: every request here is a GET or a HEAD, nothing is authenticated,
// and nothing it touches writes. It is safe to point at production, which is
// the point -- a check that can only be run against staging does not tell you
// about the site customers are using.
//
// What it is looking for is the seam. The site is static files on one host and
// Django on another, joined by a rewrite; the health check on the API proves
// the API is up, and proves nothing about whether anything can reach it
// through the front door.

const DEFAULT_TIMEOUT = 20_000;

const site = (process.argv[2] ?? '').replace(/\/$/, '');

if (!site) {
  console.error('usage: node scripts/smoke.mjs <origin>');
  process.exit(2);
}

const results = [];

/**
 * A single named check. Records rather than throws, so one failure does not
 * hide the four checks after it -- when a deploy is wrong, which of these fail
 * together is most of the diagnosis.
 */
async function check(name, run) {
  const started = Date.now();
  try {
    const detail = await run();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message, ms: Date.now() - started });
  }
}

async function get(path, { method = 'GET', timeout = DEFAULT_TIMEOUT } = {}) {
  const url = `${site}${path}`;
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
    // Otherwise Node sends no Accept at all, and a content-negotiating view
    // can reasonably answer something other than what a browser would get.
    headers: { accept: '*/*', 'user-agent': 'paylesshopmore-smoke/1' },
  });
  return { url, response };
}

// ---------------------------------------------------------------------------
// The API, through the front door.
//
// Not the API's own hostname: through the site's origin, which is what
// exercises the rewrite. If this returns HTML, the rewrite is missing or
// mis-ordered and the SPA fallback has swallowed the call -- the failure this
// whole workflow exists for.
// ---------------------------------------------------------------------------

await check('API health through the site origin', async () => {
  const { url, response } = await get('/api/health/');

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  const type = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (type.includes('text/html') || body.trimStart().startsWith('<')) {
    throw new Error(
      `${url} answered HTML, not JSON -- the /api rewrite is missing or is listed after the SPA fallback, ` +
        'so the React shell is being served in place of the API'
    );
  }

  if (!type.includes('json')) {
    throw new Error(`${url} answered content-type "${type}", expected JSON`);
  }

  return `${response.status}, ${type.split(';')[0]}`;
});

// ---------------------------------------------------------------------------
// A prerendered page, with real content in it.
//
// A 200 is not enough. If the prerender step silently did nothing, the route
// still answers 200 with the empty SPA shell, and the difference only shows up
// as a page that ranks nowhere and previews as nothing.
// ---------------------------------------------------------------------------

await check('Home page is prerendered', async () => {
  const { url, response } = await get('/');

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  const html = await response.text();

  if (!/<meta\s+property="og:title"/i.test(html)) {
    throw new Error(`${url} has no og:title -- served as the bare SPA shell rather than a prerendered page`);
  }

  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  if (!title.trim()) throw new Error(`${url} has an empty <title>`);

  return title.length > 60 ? `${title.slice(0, 57)}...` : title;
});

// ---------------------------------------------------------------------------
// A deep link, refreshed.
//
// The case a single-page app gets wrong: the route works when clicked and
// 404s when the same URL is opened cold, because the host has no fallback.
// ---------------------------------------------------------------------------

await check('Deep link answers cold', async () => {
  const { url, response } = await get('/destinations');

  if (response.status === 404) {
    throw new Error(`${url} answered 404 -- the SPA fallback is not catching unknown paths`);
  }

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  return `${response.status}`;
});

// ---------------------------------------------------------------------------
// The security headers vercel.json promises.
//
// These are configuration, not code: nothing in the test suite can tell you
// they survived a change to vercel.json, because they do not exist until the
// site is deployed.
// ---------------------------------------------------------------------------

await check('Security headers present', async () => {
  const { url, response } = await get('/', { method: 'HEAD' });

  const required = [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
  ];

  const missing = required.filter((header) => !response.headers.has(header));

  if (missing.length > 0) {
    throw new Error(`${url} is missing: ${missing.join(', ')}`);
  }

  return `${required.length} present`;
});

// ---------------------------------------------------------------------------
// robots.txt, which is the file most likely to be the wrong one.
//
// A staging deployment that disallows everything, promoted to production,
// removes the site from search results and produces no error anywhere.
// ---------------------------------------------------------------------------

await check('robots.txt does not disallow everything', async () => {
  const { url, response } = await get('/robots.txt');

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  const body = await response.text();

  if (/^\s*Disallow:\s*\/\s*$/im.test(body)) {
    throw new Error(`${url} contains "Disallow: /" -- the whole site is closed to crawlers`);
  }

  return `${body.split('\n').length} lines`;
});

// ---------------------------------------------------------------------------

console.log(`\n${site}\n`);

for (const { name, ok, detail, ms } of results) {
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${mark}  ${name.padEnd(38)} ${String(ms).padStart(5)}ms  ${detail}`);
}

const failed = results.filter((result) => !result.ok);

console.log('');

if (failed.length > 0) {
  console.error(`${failed.length} of ${results.length} checks failed.\n`);
  process.exit(1);
}

console.log(`${results.length} checks passed.\n`);
