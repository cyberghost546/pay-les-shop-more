// Writes a real HTML file for every public route after the build.
//
// The problem it solves: this is a single-page app, so the server hands the
// same index.html to /destinations/curacao as to /. React then fixes the title
// and the description in the browser — but the crawlers that build a link
// preview (WhatsApp, Facebook, LinkedIn, iMessage) do not run JavaScript.
// They read what was served and stop. Until now every link anyone shared, of
// any page, arrived showing the homepage's card.
//
// What this is not: server-side rendering. The body still ships empty and the
// app still boots in the browser. Only <head> is per-route, because <head> is
// the whole of what a link preview and a search snippet are built from.
// Rendering the body would mean making every page render without a browser,
// which is a far larger change for the part nobody is missing.
//
// Requires the host to serve dist/<route>/index.html for /<route>, which is
// what a static host does by default and what the SPA fallback would have
// done for the same URL anyway.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  PUBLIC_ROUTES,
  SITE,
  fullTitle,
  sitemapXml,
  structuredData,
} from './routes.js';

// index.html carries long comments explaining why its head is the way it is.
// They are worth having in the source and worth nothing in every copy of every
// page, and one of them contains the literal text "<title>" — which a naive
// replacement matches first, moving the real title inside a comment where no
// crawler will ever see it. Stripping them first removes both problems.
//
// Nothing here uses conditional comments, which are dead in every browser that
// matters, so there is nothing to preserve.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Only what could end an attribute early or open a tag of its own. */
function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Replace the content of one meta tag, matched on the attribute that names it.
 *
 * index.html writes some of these on one line and others across four, so the
 * pattern allows anything between the name and its content attribute — capped,
 * so a tag with no content of its own cannot reach into the next tag's.
 *
 * Deliberately narrow in one way: the tag has to already exist. A name that
 * matches nothing leaves the document untouched rather than appending a second
 * tag below the first, which is the failure that is invisible in the output.
 */
function setMeta(html, attribute, name, content) {
  const pattern = new RegExp(
    String.raw`(<meta\s+${attribute}="${name}"[\s\S]{0,120}?content=")[^"]*(")`,
    'i',
  );

  if (!pattern.test(html)) {
    throw new Error(
      `prerender: no <meta ${attribute}="${name}"> in index.html to update`,
    );
  }

  return html.replace(pattern, `$1${escapeAttr(content)}$2`);
}

/**
 * JSON-LD sits inside a script tag, where the only sequence that matters is
 * one that could close the tag early. Escaping the slash keeps the JSON valid
 * and the tag intact.
 */
function jsonLdScript(data) {
  const json = JSON.stringify(data, null, 2).replaceAll('</', String.raw`<\/`);
  return `<script type="application/ld+json">\n${json}\n    </script>`;
}

export function htmlForRoute(template, route) {
  const title = fullTitle(route);
  const url = `${SITE.url}${route.path}`;

  let html = template.replace(HTML_COMMENT, '');

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(title)}</title>`,
  );

  html = setMeta(html, 'name', 'description', route.description);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', route.description);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', route.description);

  // The canonical URL. index.html ships without one on purpose: a canonical
  // baked into the file that every route is served from would tell a crawler
  // that /destinations/aruba is the homepage. Here the URL is known, so it can
  // be stated — and stating it is what stops ?ref=whatsapp from splitting a
  // page's ranking across every link anyone has ever shared.
  //
  // The homepage's copy is also the file a static host falls back to for an
  // unmatched URL, so an unknown path inherits a canonical pointing at the
  // homepage. That is the right answer for a URL with no page behind it, and
  // the app's own routes are excluded from crawling in robots.txt.
  const head = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    jsonLdScript(structuredData(route)),
  ].join('\n    ');

  return html.replace('</head>', `  ${head}\n  </head>`);
}

/** @returns {import('vite').Plugin} */
export function prerender() {
  let outDir = 'dist';

  return {
    name: 'plsm-prerender',
    // Nothing to do in the dev server: it serves index.html for every path,
    // and React sets the title, which is what a person in a browser sees.
    apply: 'build',

    configResolved(config) {
      outDir = config.build.outDir;
    },

    // After Vite has written index.html and copied public/ across.
    async closeBundle() {
      const dist = join(process.cwd(), outDir);
      const template = await readFile(join(dist, 'index.html'), 'utf8');

      for (const route of PUBLIC_ROUTES) {
        // '/' is index.html itself, which still gets its canonical and its
        // structured data — it just has no directory of its own.
        const target =
          route.path === '/'
            ? join(dist, 'index.html')
            : join(dist, route.path.slice(1), 'index.html');

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, htmlForRoute(template, route), 'utf8');
      }

      // Generated from the same list as the pages, so a route added there
      // cannot be forgotten here.
      await writeFile(join(dist, 'sitemap.xml'), sitemapXml(), 'utf8');

      this.info?.(
        `prerendered ${PUBLIC_ROUTES.length} routes and wrote sitemap.xml`,
      );
    },
  };
}
