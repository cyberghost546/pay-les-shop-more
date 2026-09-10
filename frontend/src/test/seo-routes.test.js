// Keeps the build-time SEO route table honest.
//
// scripts/routes.js is loaded by the Vite config, which esbuild bundles before
// any of the app's asset handling exists — so it cannot import
// src/data/destinations.js, which imports images. That leaves two lists of
// islands in the repository, and the failure mode is quiet: add a destination,
// forget the other file, and the new page ships with no sitemap entry and the
// homepage's link preview.
//
// This test is what makes that loud instead. It runs under Vitest, which does
// resolve the image imports, so it can hold both lists side by side.

import { describe, expect, it } from 'vitest';
import { DESTINATIONS as APP_DESTINATIONS } from '../data/destinations';
import {
  DESTINATIONS as SEO_DESTINATIONS,
  PUBLIC_ROUTES,
  SITE,
  fullTitle,
  sitemapXml,
  structuredData,
} from '../../scripts/routes';

describe('the SEO route table', () => {
  it('describes exactly the islands the app ships to', () => {
    expect(SEO_DESTINATIONS.map((item) => item.slug)).toEqual(
      APP_DESTINATIONS.map((item) => item.slug),
    );
  });

  it('quotes the same port and transit time the pages show', () => {
    // These end up in the meta description, which is what a searcher reads
    // before deciding to click. A description promising 21 days for a page
    // that says 24 is worse than no description.
    for (const seo of SEO_DESTINATIONS) {
      const app = APP_DESTINATIONS.find((item) => item.slug === seo.slug);
      expect({ port: seo.port, transitDays: seo.transitDays }).toEqual({
        port: app.port,
        transitDays: app.transitDays,
      });
    }
  });

  it('gives every island a page', () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);

    for (const destination of APP_DESTINATIONS) {
      expect(paths).toContain(`/destinations/${destination.slug}`);
    }
  });

  it('has one entry per URL', () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every route a title and a description a search result can use', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true);

      // Google truncates a title around 60 characters and a description
      // around 160. Longer is not an error, but it is a sentence nobody
      // finishes reading.
      expect(fullTitle(route).length).toBeLessThanOrEqual(70);
      expect(route.description.length).toBeGreaterThan(50);
      expect(route.description.length).toBeLessThanOrEqual(200);
    }
  });

  it('lists nothing that sits behind a login', () => {
    // Mirrors robots.txt. A sitemap entry for a page that redirects to the
    // login form is a crawl budget spent on nothing.
    const private_ = ['/dashboard', '/profile', '/login', '/signup', '/forgot-password'];

    for (const route of PUBLIC_ROUTES) {
      expect(private_).not.toContain(route.path);
    }
  });

  it('generates a sitemap covering every public route', () => {
    const xml = sitemapXml();

    for (const route of PUBLIC_ROUTES) {
      expect(xml).toContain(`<loc>${SITE.url}${route.path}</loc>`);
    }
  });

  it('describes the business once and the page once', () => {
    const home = structuredData(PUBLIC_ROUTES[0]);
    expect(home['@graph'].map((node) => node['@type'])).toEqual([
      'Organization',
      'WebSite',
    ]);

    // A destination page adds the service, pointing back at the same
    // organisation node rather than describing the company again.
    const curacao = PUBLIC_ROUTES.find(
      (route) => route.path === '/destinations/curacao',
    );
    const graph = structuredData(curacao)['@graph'];

    expect(graph.map((node) => node['@type'])).toContain('Service');
    expect(graph.at(-1).provider).toEqual({ '@id': `${SITE.url}/#organization` });
  });
});
