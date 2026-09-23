// The shop grid. What is worth pinning down is the wiring rather than the
// styling: that the six shops the client asked for are all there, in their
// order, each one linking out to its own Dutch storefront, and that the
// "all shops" button still leads somewhere real.
//
// The four-step strip that used to sit under the cards was removed; the page
// tells that story further down instead.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { FEATURED_SHOPS } from '../../data/shops';
import ShopGrid from './ShopGrid';

describe('ShopGrid', () => {
  it('shows the six featured shops, in order', () => {
    renderWithProviders(<ShopGrid />);

    const logos = screen.getAllByRole('img');
    expect(logos.map((logo) => logo.getAttribute('alt'))).toEqual([
      'Zalando',
      'IKEA',
      'Bol.com',
      'Action',
      'MediaMarkt',
      'Coolblue',
    ]);
  });

  it("links each card to that shop's own site, safely", () => {
    renderWithProviders(<ShopGrid />);

    for (const shop of FEATURED_SHOPS) {
      const link = screen.getByRole('img', { name: shop.name }).closest('a');
      expect(link).toHaveAttribute('href', shop.href);
      // Without noopener the shop's page can reach back through window.opener.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
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
