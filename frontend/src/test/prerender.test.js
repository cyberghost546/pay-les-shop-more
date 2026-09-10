// The prerenderer rewrites <head> with string surgery, which is the sort of
// code that fails silently: a pattern that stops matching leaves the tag as it
// was, the build still succeeds, and the only symptom is every shared link
// showing the homepage again months later.
//
// So these run against the real index.html rather than a fixture. If someone
// reformats a meta tag in it, that is exactly when this should fail.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlForRoute } from '../../scripts/prerender';
import { PUBLIC_ROUTES, SITE, fullTitle } from '../../scripts/routes';

// Resolved from the project root rather than from import.meta.url: these
// tests run in the jsdom environment, where a module's URL is an http one and
// has no filesystem path to derive.
const template = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const curacao = PUBLIC_ROUTES.find(
  (route) => route.path === '/destinations/curacao',
);

const home = PUBLIC_ROUTES.find((route) => route.path === '/');

describe('prerendering a route', () => {
  const html = htmlForRoute(template, curacao);

  it('gives the page its own title', () => {
    expect(html).toContain(`<title>${fullTitle(curacao)}</title>`);
    // Exactly one, and not the site-wide one it replaced.
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).not.toContain('<title>PayLesShopMore — Shop and ship');
  });

  it('gives the link preview the page it points at', () => {
    // The whole point of the exercise: a crawler that runs no JavaScript has
    // to find this page's card here, in the served file.
    expect(html).toContain(`content="${fullTitle(curacao)}"`);
    expect(html).toContain(
      `<meta property="og:url" content="${SITE.url}/destinations/curacao" />`,
    );
    expect(html).toContain(curacao.description);
    expect(html).not.toContain('<meta property="og:url" content="https://paylesshopmore.com/" />');
  });

  it('points the canonical URL at this page and not the homepage', () => {
    expect(html).toContain(
      `<link rel="canonical" href="${SITE.url}/destinations/curacao" />`,
    );
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it('embeds structured data a parser can actually read', () => {
    const [, json] =
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) ??
      [];

    expect(json).toBeTruthy();
    const parsed = JSON.parse(json);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@graph'].map((node) => node['@type'])).toContain('Service');
  });

  it('keeps the parts of the head that are not per-page', () => {
    // The security policy, the fonts and the module script are the reason the
    // page works at all. String surgery on a document is exactly the kind of
    // change that takes one of them with it.
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script type="module"/);
  });

  it('drops the comments rather than shipping them to every visitor', () => {
    expect(html).not.toContain('<!--');
    // Including the one containing the literal text "<title>", which is what
    // a naive replacement matches first — putting the real title inside a
    // comment where no crawler will ever see it.
    expect(html).not.toContain('React 19 hoists');
  });

  it('leaves the homepage as its own canonical page', () => {
    const homeHtml = htmlForRoute(template, home);
    expect(homeHtml).toContain(`<link rel="canonical" href="${SITE.url}/" />`);
    expect(homeHtml).toContain(`<title>${fullTitle(home)}</title>`);
  });

  it('fails loudly if a tag it edits is renamed away', () => {
    const withoutOgUrl = template.replace('og:url', 'og:location');
    expect(() => htmlForRoute(withoutOgUrl, curacao)).toThrow(/og:url/);
  });
});
