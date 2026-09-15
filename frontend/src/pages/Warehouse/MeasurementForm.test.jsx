import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMeasurement } from '../../api/warehouse';
import { renderWithProviders } from '../../test/utils';
import MeasurementForm from './MeasurementForm';

vi.mock('../../api/warehouse', async (importOriginal) => ({
  ...(await importOriginal()),
  saveMeasurement: vi.fn(),
}));

const SHIPMENT = { id: 7, measurement: null };

describe('MeasurementForm', () => {
  beforeEach(() => vi.mocked(saveMeasurement).mockReset());

  it('refuses impossible numbers before anything is sent', async () => {
    renderWithProviders(<MeasurementForm shipment={SHIPMENT} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/Weight/), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurements' }));

    expect(await screen.findByText(/Weight must be between/)).toBeInTheDocument();
    expect(screen.getByText('Length is required.')).toBeInTheDocument();
    expect(saveMeasurement).not.toHaveBeenCalled();
  });

  it('moves along with Enter, shows the volume, and saves with dot decimals', async () => {
    const onSaved = vi.fn();
    vi.mocked(saveMeasurement).mockResolvedValue({ measurement: {}, shipment: SHIPMENT });
    renderWithProviders(<MeasurementForm shipment={SHIPMENT} onSaved={onSaved} />);

    // Focus starts on weight; Enter moves to the next box and saves on the last.
    await userEvent.keyboard('12,5{Enter}60{Enter}40{Enter}30');
    expect(screen.getByText('0,072 m³')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveMeasurement).toHaveBeenCalledWith(7, {
      weight_kg: '12.5',
      length_cm: '60',
      width_cm: '40',
      height_cm: '30',
    });
  });

  it('speaks the chosen language', async () => {
    window.localStorage.setItem('plsm.language', 'nl');
    renderWithProviders(<MeasurementForm shipment={SHIPMENT} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Metingen opslaan' }));
    expect(await screen.findByText('Gewicht is verplicht.')).toBeInTheDocument();
  });
});
