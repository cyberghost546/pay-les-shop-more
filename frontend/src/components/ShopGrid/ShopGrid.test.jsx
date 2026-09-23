// The sliding shop rows. What is worth pinning down is the wiring rather than
// the styling: that the shops the office maintains are all there, each one
// linking out to its own Dutch storefront, and that the "all shops" button
// still leads somewhere real.
//
// These render without a server, so what they see is the bundled fallback in
// src/data/shops.js - which is the point of that fallback existing.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { SHOPS, displayLogo } from '../../data/shops';
import ShopGrid from './ShopGrid';

describe('ShopGrid', () => {
  it('shows every shop, in the order the office arranged them', () => {
    renderWithProviders(<ShopGrid />);

    const named = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));

    // Split across two rows, so the order runs down the first row and then
    // the second rather than straight across.
    expect(new Set(named)).toEqual(new Set(SHOPS.map((shop) => shop.name)));
  });

  it('prefers a long logo where a shop has one', () => {
    renderWithProviders(<ShopGrid />);

    const bol = SHOPS.find((shop) => shop.name === 'Bol.com');
    expect(screen.getAllByRole('img', { name: 'Bol.com' })[0]).toHaveAttribute(
      'src',
      displayLogo(bol),
    );
  });

  it("links each card to that shop's own site, safely", () => {
    renderWithProviders(<ShopGrid />);

    for (const shop of SHOPS) {
      const link = screen.getAllByRole('img', { name: shop.name })[0].closest('a');
      expect(link).toHaveAttribute('href', shop.href);
      // Without noopener the shop's page can reach back through window.opener.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders the row twice but only announces it once', () => {
    const { container } = renderWithProviders(<ShopGrid />);

    // The track is doubled so the slide can loop without a seam, so the
    // markup really does hold twelve cards...
    // Each row repeats its shops until it fills its window, then again for
    // the loop - so the markup holds well over one copy of the list.
    expect(container.querySelectorAll('li').length).toBeGreaterThan(
      SHOPS.length,
    );

    // ...but a screen reader is told about six, and only six are reachable
    // by tab. Hearing or tabbing the same shops twice would be a bug.
    expect(screen.getAllByRole('img')).toHaveLength(SHOPS.length);
    // Scoped to the cards: the "See all shops" button below them is an
    // anchor too, and is meant to be tabbable.
    expect(
      [...container.querySelectorAll('li a')].filter(
        (link) => link.getAttribute('tabindex') !== '-1',
      ),
    ).toHaveLength(SHOPS.length);
  });

  it('sends anyone wanting more shops to the services page', () => {
    renderWithProviders(<ShopGrid />);

    expect(screen.getByRole('link', { name: 'See all shops' })).toHaveAttribute(
      'href',
      '/services',
    );
  });

  it('is titled, so the section is announced rather than anonymous', () => {
    renderWithProviders(<ShopGrid />);

    expect(
      screen.getByRole('region', { name: 'ORDER FROM YOUR FAVOURITE SHOPS' }),
    ).toBeInTheDocument();
  });
});
