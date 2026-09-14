import { describe, expect, it } from 'vitest';
import { EMPTY_LINE, isComplete, toLinePayload, totalsFor } from './measure';

const pallets = {
  ...EMPTY_LINE,
  quantity: '2',
  packaging: 'pallet',
  length_cm: '120',
  width_cm: '80',
  height_cm: '150',
  weight_kg: '170',
};

describe('measurement totals', () => {
  it('adds up the complete lines the same way the server does', () => {
    const crate = { ...EMPTY_LINE, length_cm: '50', width_cm: '40', height_cm: '30', weight_kg: '12.5' };
    const totals = totalsFor([pallets, crate]);

    expect(totals.colli).toBe(3);
    expect(totals.volume).toBeCloseTo(2.94, 3);
    expect(totals.weight).toBeCloseTo(352.5, 2);
    expect(totals.volumetric).toBeCloseTo(490, 2);
  });

  it('counts a half-measured line as colli but leaves it out of the volume', () => {
    const half = { ...EMPTY_LINE, quantity: '3', length_cm: '100' };

    expect(isComplete(half)).toBe(false);
    expect(totalsFor([half])).toEqual({ colli: 3, volume: null, weight: null, volumetric: null });
  });

  it('sends blank sizes as null rather than zero', () => {
    expect(toLinePayload({ ...EMPTY_LINE, length_cm: '' }).length_cm).toBeNull();
  });
});
