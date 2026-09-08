// src/hooks/usePageMeta.js
//
// Gives each route its own <title>, meta description and canonical URL.
//
// Written imperatively rather than by rendering <title> and <meta> in the
// component, which React 19 would hoist into <head> on its own. The reason is
// index.html: it already ships a <title> and a description so that a link
// pasted into WhatsApp has something to show, and hoisting appends rather than
// replaces. Two <title> elements in a document is not an error — the browser
// simply uses the first — so the static one would quietly win and every route
// would keep the same tab name, which is the bug this is here to fix.
//
// Setting the properties directly has no such ambiguity, and it is also what
// lets the canonical link be rewritten instead of duplicated.
//
// What this cannot do is fix link previews per route. WhatsApp, Facebook and
// iMessage read the served HTML and never run this. Per-route sharing needs
// the routes prerendered at build time; until then the og:* tags in
// index.html are the site-wide card, deliberately.

import { useEffect } from 'react';

const SITE_NAME = 'PayLesShopMore';
const SITE_URL = 'https://paylesshopmore.com';

// What index.html says. Restored on unmount so a page that sets a title cannot
// leave it behind on one that does not.
const DEFAULT_TITLE = `${SITE_NAME} — Shop and ship to the Caribbean`;
const DEFAULT_DESCRIPTION =
  'Order from Dutch webshops and ship to the Caribbean. We gather your ' +
  'parcels in one place and you follow every shipment to your door — ' +
  'Aruba, Bonaire, Curaçao, Sint Maarten and Suriname.';

/** Set the content of a <meta> by name, creating it if the page has none. */
function setMetaByName(name, content) {
  let tag = document.head.querySelector(`meta[name="${name}"]`);

  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }

  tag.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');

  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }

  link.setAttribute('href', href);
}

/**
 * @param title       The page's own name. The site name is appended, so pass
 *                    "Tracking", not "Tracking — PayLesShopMore".
 * @param description One or two sentences. Falls back to the site default.
 * @param path        Canonical path, e.g. "/destinations/aruba". Defaults to
 *                    the URL actually being viewed, which is right for every
 *                    page that is not reachable under more than one address.
 */
export function usePageMeta(title, description, path) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
    setMetaByName('description', description || DEFAULT_DESCRIPTION);

    // Query strings and hashes are stripped: ?ref=whatsapp is the same page,
    // and telling a crawler otherwise splits its ranking across every link
    // anyone has ever shared.
    setCanonical(`${SITE_URL}${path || window.location.pathname}`);

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaByName('description', DEFAULT_DESCRIPTION);
    };
  }, [title, description, path]);
}
