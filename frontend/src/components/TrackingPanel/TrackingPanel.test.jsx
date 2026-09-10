// The public tracking lookup: the one thing on the site a visitor uses
// without an account, and the one most likely to be reached from a link in an
// e-mail while they are already anxious about a parcel.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import TrackingPanel from './TrackingPanel';
import { TRACKING_ERRORS, trackShipment } from '../../api/tracking';

// Only the network call is faked. The mapping from an HTTP status to a
// TRACKING_ERRORS code belongs to the api module and is tested through the
// codes this panel is asked to render.
vi.mock('../../api/tracking', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackShipment: vi.fn() };
});

const SHIPMENT = {
  tracking_number: 'PLSM-1001',
  status: 'in_transit',
  status_display: 'In transit',
  destination: 'Curaçao',
  shipped_at: '2026-02-01T00:00:00Z',
  delivered_at: null,
  estimated_arrival: '2026-02-22T00:00:00Z',
  progress: 60,
  stage_index: 2,
  stages: [
    { value: 'paid', label: 'Paid' },
    { value: 'purchased', label: 'Products purchased' },
    { value: 'in_transit', label: 'In transit' },
    { value: 'delivered', label: 'Delivered' },
  ],
};

/** Throws the way the api module does, with a code the panel maps to copy. */
function apiError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

describe('TrackingPanel', () => {
  beforeEach(() => {
    trackShipment.mockReset();
  });

  it('asks for a number instead of searching for an empty one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrackingPanel />);

    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a tracking number.',
    );
    // The point of the check: no request is made, so an empty box cannot eat
    // one of the visitor's forty lookups an hour.
    expect(trackShipment).not.toHaveBeenCalled();
  });

  it('shows the shipment when the number is found', async () => {
    const user = userEvent.setup();
    trackShipment.mockResolvedValue(SHIPMENT);
    renderWithProviders(<TrackingPanel />);

    await user.type(screen.getByRole('textbox'), 'PLSM-1001');
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    expect(await screen.findByText('PLSM-1001')).toBeInTheDocument();
    // Twice on purpose: the status badge, and the current stage of the
    // timeline underneath it.
    expect(screen.getAllByText('In transit')).toHaveLength(2);
    expect(screen.getByText('Curaçao')).toBeInTheDocument();

    // The progress bar carries the number for anyone not looking at the bar.
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
  });

  it('trims what was typed before searching', async () => {
    const user = userEvent.setup();
    trackShipment.mockResolvedValue(SHIPMENT);
    renderWithProviders(<TrackingPanel />);

    // Copying a number out of an e-mail brings whitespace with it.
    await user.type(screen.getByRole('textbox'), '  PLSM-1001  ');
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    await waitFor(() => expect(trackShipment).toHaveBeenCalledWith('PLSM-1001'));
  });

  it('says the number is unknown rather than that the site is broken', async () => {
    const user = userEvent.setup();
    trackShipment.mockRejectedValue(apiError(TRACKING_ERRORS.NOT_FOUND));
    renderWithProviders(<TrackingPanel />);

    await user.type(screen.getByRole('textbox'), 'NOPE-1');
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).not.toMatch(/unavailable|offline/i);
  });

  it('explains a rate limit in its own words', async () => {
    const user = userEvent.setup();
    trackShipment.mockRejectedValue(apiError(TRACKING_ERRORS.RATE_LIMITED));
    renderWithProviders(<TrackingPanel />);

    await user.type(screen.getByRole('textbox'), 'PLSM-1001');
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    // Distinct from the offline message: one is worth retrying now, the other
    // is worth waiting out.
    const rateLimited = (await screen.findByRole('alert')).textContent;

    trackShipment.mockRejectedValue(apiError(TRACKING_ERRORS.UNAVAILABLE));
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).not.toBe(rateLimited),
    );
  });

  it('clears a stale error as soon as the number is edited', async () => {
    const user = userEvent.setup();
    trackShipment.mockRejectedValue(apiError(TRACKING_ERRORS.NOT_FOUND));
    renderWithProviders(<TrackingPanel />);

    await user.type(screen.getByRole('textbox'), 'NOPE-1');
    await user.click(screen.getByRole('button', { name: 'Track shipment' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), '2');

    // "Not found" sitting under a number being corrected reads as a verdict
    // on what is now in the box.
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  // The lock, as the visitor meets it. `locked` comes from the server rather
  // than being worked out from the status here, so these tests set it the way
  // the API does.
  describe('a shipment that has already gone', () => {
    async function look(shipment) {
      const user = userEvent.setup();
      trackShipment.mockResolvedValue(shipment);
      renderWithProviders(<TrackingPanel />);

      await user.type(screen.getByRole('textbox'), 'PLSM-1001');
      await user.click(screen.getByRole('button', { name: 'Track shipment' }));
      return screen.findByText('Shipment sent');
    }

    it('says so, and says where the next purchase goes', async () => {
      await look({ ...SHIPMENT, locked: true });

      expect(
        screen.getByText(/sent as a separate shipment, with their own/i),
      ).toBeInTheDocument();
    });

    it('says delivered rather than sent once it has arrived', async () => {
      await look({
        ...SHIPMENT,
        status: 'delivered',
        status_display: 'Delivered',
        locked: true,
      });

      expect(screen.getByText(/has been delivered and can no longer/i)).toBeInTheDocument();
    });

    it('says cancelled rather than talking about shipping', async () => {
      await look({
        ...SHIPMENT,
        status: 'cancelled',
        status_display: 'Cancelled',
        locked: true,
      });

      expect(screen.getByText(/was cancelled and can no longer/i)).toBeInTheDocument();
    });

    it('says nothing at all about a shipment still being prepared', async () => {
      const user = userEvent.setup();
      trackShipment.mockResolvedValue({
        ...SHIPMENT,
        status: 'paid',
        status_display: 'Paid',
        locked: false,
      });
      renderWithProviders(<TrackingPanel />);

      await user.type(screen.getByRole('textbox'), 'PLSM-1001');
      await user.click(screen.getByRole('button', { name: 'Track shipment' }));

      expect(await screen.findByText('PLSM-1001')).toBeInTheDocument();
      expect(screen.queryByText('Shipment sent')).not.toBeInTheDocument();
    });
  });
});
