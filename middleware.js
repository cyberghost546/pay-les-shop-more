// Edge middleware: a shared login in front of the whole site.
//
// The site is deployed on a personal Vercel account, where the production URL
// is public and the dashboard's own Password Protection is a paid feature. So
// the gate lives here instead: HTTP Basic auth, one shared username and
// password, handed out to the people working on the project.
//
// This is a "not for the public yet" curtain, not account security. Everyone
// shares one credential and the browser remembers it for the session. Real
// user accounts are the Django session behind /api, and they are unaffected.
//
// Configure in Vercel → Project → Settings → Environment Variables:
//   PREVIEW_USER      the shared username
//   PREVIEW_PASSWORD  the shared password
// Remove both (and this file) on the day the site goes public.

// On a non-Next.js project, letting a request through means returning
// next() — a plain `return` would instead end the chain with an empty 200.
import { next } from '@vercel/functions';

// Header values must be ASCII, so no fancy punctuation in here.
const REALM = 'Pay Les Shop More private preview';

// /api is rewritten to the Django API, and the browser attaches the Basic
// credentials to every same-origin request once it has them. Django REST
// Framework tries Basic auth before falling back to the session cookie, so a
// forwarded header would fail every API call with a 401. The API is a separate
// origin with its own authentication; it does not need this curtain.
function isApiRequest(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

// Comparing with === leaks how many characters matched, through how long the
// comparison took. Not much of a risk for a shared preview password, but the
// fix is four lines.
function matches(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function challenge(body) {
  return new Response(body, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      // Nothing behind the gate should sit in a shared cache.
      'Cache-Control': 'no-store',
    },
  });
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);

  if (isApiRequest(pathname)) return next();

  const user = process.env.PREVIEW_USER;
  const password = process.env.PREVIEW_PASSWORD;

  // Failing open would leave the site quietly public, which is the one
  // outcome this file exists to prevent.
  if (!user || !password) {
    return new Response(
      'This deployment is not configured. Set PREVIEW_USER and ' +
        'PREVIEW_PASSWORD in the Vercel project settings and redeploy.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('basic ')) {
    return challenge('Authentication required.');
  }

  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return challenge('Authentication required.');
  }

  // The password may itself contain a colon; the username may not.
  const separator = decoded.indexOf(':');
  if (separator === -1) return challenge('Authentication required.');

  const ok =
    matches(decoded.slice(0, separator), user) &&
    matches(decoded.slice(separator + 1), password);

  return ok ? next() : challenge('Wrong username or password.');
}
