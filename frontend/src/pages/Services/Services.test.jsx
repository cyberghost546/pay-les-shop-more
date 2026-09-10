// The services page is now four bands and nothing else: the banner, the
// yellow strip, one panel per island, and the brands.
//
// These check the shape rather than the styling, and the thing most worth
// pinning down is what is *not* there any more. The rates table and the
// frequently asked questions were removed deliberately; a test that says so
// is what stops them coming back by accident in a merge.

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Services from './Services';
import { BRANDS, ISLAND_SERVICES } from '../../data/islandServices';

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
    expect(within(strip).getByText('Transport taken care of')).toBeInTheDocument();
  });

  it('gives every island its own panel, titled with its name', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const panels = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => text.startsWith('Our services for'));

    // One panel per island the site ships to, and no leftovers for an island
    // it no longer serves.
    expect(panels).toHaveLength(ISLAND_SERVICES.length);
  });

  it("lists Curaçao's own services under Curaçao", () => {
    renderWithProviders(<Services />, { route: '/services' });

    const curacao = ISLAND_SERVICES.find((item) => item.slug === 'curacao');
    const panel = screen
      .getByText(`Our services for ${'Curaçao'}`)
      .closest('li');

    for (const service of curacao.services) {
      expect(within(panel).getByText(service)).toBeInTheDocument();
    }
  });

  it('sends each service to the island it belongs to', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const bonaire = screen.getByText('Our services for Bonaire').closest('li');

    // Shop names, not shops: the link goes to that island's page, where the
    // quote form is, rather than off to bol.com.
    for (const link of within(bonaire).getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '/destinations/bonaire');
    }
  });

  it('shows the brands strip', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { name: 'Our brands' }),
    ).toBeInTheDocument();

    // Scoped to the strip: several of these names are also services listed
    // under an island above it.
    const strip = screen.getByRole('group', { name: 'Our brands' });

    for (const brand of BRANDS) {
      expect(within(strip).getByText(brand.name)).toBeInTheDocument();
    }
  });

  it('no longer carries the rates table or the questions', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Removed on purpose. If one of these ever passes again, somebody has put
    // a section back without deciding to.
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /frequently asked/i }),
    ).not.toBeInTheDocument();
  });
});
