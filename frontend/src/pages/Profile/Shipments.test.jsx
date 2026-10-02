// "Mijn zendingen" on the profile page: the customer's shipments, split
// under "Nog te verzenden", "Onderweg" and "Ontvangen", each with its status
// in the page's language and its dates with the time.
//
// Read in Dutch, the site's default language, because the English status
// coming from the server is exactly what these tests make sure is replaced.

import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { listPackages } from '../../api/profile';
import Shipments from './Shipments';

vi.mock('../../api/profile', () => ({ listPackages: vi.fn() }));

/** A shipment as the API sends it. */
function shipment(id, status, extra = {}) {
  return {
    id,
    tracking_number: `PLSM-${id}`,
    description: `Zending ${id}`,
    status,
    // What the server sends: English only.
    status_display: `EN ${status}`,
    locked: ['in_transit', 'arrived', 'delivered', 'cancelled'].includes(status),
    shipped_at: null,
    delivered_at: null,
    created_at: '2026-09-29T10:12:00Z',
    ...extra,
  };
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  listPackages.mockReset();
});

/** The group headings in the order they are on the page. */
const headings = () =>
  screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('Mijn zendingen', () => {
  it('splits the shipments into to send, on the way and received', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'paid'),
      shipment(2, 'in_transit', { shipped_at: '2026-09-24T16:30:00Z' }),
      shipment(3, 'delivered', {
        shipped_at: '2026-08-23T16:30:00Z',
        delivered_at: '2026-09-13T11:15:00Z',
      }),
      shipment(4, 'ready_for_shipping'),
    ]);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    // Heading text includes the count badge.
    expect(headings()).toEqual(['Nog te verzenden2', 'Onderweg1', 'Ontvangen1']);

    const toSend = screen.getByRole('heading', { name: /Nog te verzenden/ }).closest('section');
    expect(within(toSend).getByText('PLSM-1')).toBeInTheDocument();
    expect(within(toSend).getByText('PLSM-4')).toBeInTheDocument();
    const received = screen.getByRole('heading', { name: /Ontvangen/ }).closest('section');
    expect(within(received).getByText('PLSM-3')).toBeInTheDocument();
  });

  it('shows the status in Dutch, not the English the server sends', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'paid'),
      shipment(2, 'arrived', { shipped_at: '2026-09-12T16:30:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('Betaald')).toBeInTheDocument();
    expect(screen.getByText('Aangekomen op bestemming')).toBeInTheDocument();
    expect(screen.queryByText(/^EN /)).toBeNull();
  });

  it('heads a delivered shipment "afgeleverd", not "onderweg"', async () => {
    listPackages.mockResolvedValue([
      shipment(3, 'delivered', {
        shipped_at: '2026-08-23T16:30:00Z',
        delivered_at: '2026-09-13T11:15:00Z',
      }),
    ]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('Zending is afgeleverd')).toBeInTheDocument();
    expect(screen.queryByText('Zending is onderweg')).toBeNull();
  });

  it('shows dates with the time', async () => {
    listPackages.mockResolvedValue([shipment(1, 'paid')]);
    renderWithProviders(<Shipments />);

    // "Aangemeld op 29 sep 2026, 12:12" - the exact hour depends on the
    // time zone the tests run in, so only the shape is checked.
    const line = await screen.findByText(/Aangemeld op/);
    expect(line.textContent).toMatch(/2026,? \d{1,2}:\d{2}/);
    expect(line.textContent).toMatch(/Nog niet verscheept/);
  });

  it('still shows a shipment with a status it does not know', async () => {
    // A status added on the server after this page was written: placed by
    // its dates, and labelled with what the server sends.
    listPackages.mockResolvedValue([
      shipment(9, 'held_at_customs', { shipped_at: '2026-09-20T16:30:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('PLSM-9')).toBeInTheDocument();
    expect(headings()).toEqual(['Onderweg1']);
    expect(screen.getByText('EN held_at_customs')).toBeInTheDocument();
  });

  it('says so when there are no shipments', async () => {
    listPackages.mockResolvedValue([]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('U heeft nog geen zendingen.')).toBeInTheDocument();
  });
});
