import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listDeliveries, markDelivered } from '../../api/driver';
import { renderWithProviders } from '../../test/utils';
import DriverPage from './DriverPage';

vi.mock('../../api/driver', () => ({
  listDeliveries: vi.fn(),
  markDelivered: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Dirk Chauffeur', email: 'dirk@example.com', role: 'driver' },
    signOut: vi.fn(),
  }),
}));

const DELIVERY = {
  id: 5,
  tracking_number: 'PLS-3001',
  customer: 'Klaas Klant',
  customer_phone: '+599 9 123 4567',
  delivery_address_text: 'Kaya Grandi 24\nWillemstad\nCuraçao',
  estimated_arrival: null,
  delivered: null,
};

describe('DriverPage', () => {
  beforeEach(() => {
    vi.mocked(listDeliveries).mockReset().mockResolvedValue([DELIVERY]);
    vi.mocked(markDelivered).mockReset();
  });

  it('lists what is waiting, with call and directions one tap away', async () => {
    renderWithProviders(<DriverPage />);

    const card = (await screen.findByText('PLS-3001')).closest('li');
    expect(within(card).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+59991234567');
    expect(within(card).getByRole('link', { name: 'Directions' }).getAttribute('href')).toContain(
      'google.com/maps',
    );
  });

  it('records a delivery with the name of whoever took it', async () => {
    vi.mocked(markDelivered).mockResolvedValue({ ...DELIVERY, delivered: { recipient_name: 'Buurvrouw' } });
    renderWithProviders(<DriverPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delivered' }));
    const name = screen.getByLabelText('Received by');
    expect(name).toHaveValue('Klaas Klant');
    await userEvent.clear(name);
    await userEvent.type(name, 'Buurvrouw');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delivery' }));

    await waitFor(() =>
      expect(markDelivered).toHaveBeenCalledWith(5, { recipientName: 'Buurvrouw', note: '', photo: null }),
    );
    expect(await screen.findByText('PLS-3001 delivered to Buurvrouw.')).toBeInTheDocument();
  });
});
