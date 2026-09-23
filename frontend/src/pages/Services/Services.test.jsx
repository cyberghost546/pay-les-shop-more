// The services page is six bands: the split banner, the yellow strip, the
// three islands as photographs, the companies, the brands strip, and the
// closing call to action.
//
// These check the shape rather than the styling. The thing most worth pinning
// down is what the island cards must *not* carry: the design brief asks for a
// photograph and nothing else - no name, no caption, no button drawn on the
// card. That is easy to undo by accident, so it is tested.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Services from './Services';
import { DESTINATIONS } from '../../data/destinations';
import { SHOPS } from '../../data/shops';

describe('the services page', () => {
  it('opens with the banner and the breadcrumb', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'SERVICES' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows the three selling points in the yellow strip', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Each item is an icon and its label in one element, so the text is
    // matched on the element's own content rather than exactly.
    const strip = screen.getByText('VAT exemption').closest('ul');

    // The wording customers arrive knowing: no VAT, and it gets there.
    expect(within(strip).getByText('VAT exemption')).toBeInTheDocument();
    expect(within(strip).getByText('Unique products')).toBeInTheDocument();
    expect(
      within(strip).getByText('Transport taken care of'),
    ).toBeInTheDocument();
  });

  it('introduces the page in one line', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByText(
        'Discover our services and partners on Aruba, Bonaire and Curaçao.',
      ),
    ).toBeInTheDocument();
  });

  it('shows one photograph per island, linking to that island', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const islands = screen.getByRole('list', { name: 'Our islands' });
    const cards = within(islands).getAllByRole('listitem');
    expect(cards).toHaveLength(DESTINATIONS.length);

    // The island is named only in the alt text, never drawn on the card.
    expect(
      within(islands)
        .getAllByRole('img')
        .map((image) => image.getAttribute('alt')),
    ).toEqual(['Aruba', 'Bonaire', 'Curaçao']);

    const links = within(islands).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      DESTINATIONS.map((destination) => `/destinations/${destination.slug}`),
    );
  });

  it('draws nothing on an island card but the photograph', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const islands = screen.getByRole('list', { name: 'Our islands' });

    for (const card of within(islands).getAllByRole('listitem')) {
      // Whatever the card contains, none of it is visible text: no island
      // name, no country, no caption, no button label.
      expect(card.textContent).toBe('');
      expect(within(card).queryByRole('button')).not.toBeInTheDocument();
      expect(within(card).queryByRole('heading')).not.toBeInTheDocument();
    }
  });

  it('lays the shops out as a grid of cards', async () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { name: 'Companies and services' }),
    ).toBeInTheDocument();

    // The bundled list is what renders before - and instead of - an answer
    // from the API, so the grid is never empty even with no server behind it.
    const named = await screen.findAllByRole('heading', { level: 3 });
    expect(named.map((heading) => heading.textContent)).toEqual(
      SHOPS.map((shop) => shop.name),
    );
  });

  it('sends each shop card to that shop, safely', () => {
    renderWithProviders(<Services />, { route: '/services' });

    for (const shop of SHOPS) {
      const card = screen
        .getByRole('heading', { level: 3, name: shop.name })
        .closest('li');
      const link = within(card).getByRole('link', { name: 'View service' });

      expect(link).toHaveAttribute('href', shop.href);
      // Without noopener the shop's page can reach back through window.opener.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('shows the brands strip', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { name: 'Our brands' }),
    ).toBeInTheDocument();

    // Scoped to the strip: the company cards above it carry names too.
    const strip = screen.getByRole('group', { name: 'Our brands' });

    // Each brand is named: by its logo's alt text, or in type without one.
    for (const shop of SHOPS) {
      const named = shop.logo
        ? within(strip).getByRole('img', { name: shop.name })
        : within(strip).getByText(shop.name);
      expect(named).toBeInTheDocument();
    }
  });

  it('closes on the call to action', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { name: 'Wondering what we can do for you?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Get in touch with us' }),
    ).toHaveAttribute('href', '/contact');
  });

  it('no longer carries the rates table or the questions', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Removed on purpose, and still gone after the redesign. If one of these
    // ever passes again, somebody has put a section back without deciding to.
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /frequently asked/i }),
    ).not.toBeInTheDocument();
  });
});
