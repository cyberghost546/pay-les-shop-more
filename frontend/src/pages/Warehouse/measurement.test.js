import { describe, expect, it } from 'vitest';
import { derived, parseNumber, toPayload, validateField, validateMeasurement } from './measurement';

describe('parseNumber', () => {
  it('accepts a comma or a dot', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber(' 12.5 ')).toBe(12.5);
  });

  it('refuses junk, negatives and blanks', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
    expect(parseNumber('1e5')).toBeNull();
  });
});

describe('validation', () => {
  it('checks range and decimal places', () => {
    expect(validateField('weight_kg', '0')).toMatch(/between/);
    expect(validateField('weight_kg', '99999')).toMatch(/between/);
    expect(validateField('weight_kg', '1.234')).toMatch(/decimal/);
    expect(validateField('length_cm', '60.5')).toBe('');
  });

  it('reports every missing field', () => {
    expect(Object.keys(validateMeasurement({}))).toEqual([
      'weight_kg',
      'length_cm',
      'width_cm',
      'height_cm',
    ]);
  });
});

describe('derived', () => {
  it('computes volume and dimensional weight like the server', () => {
    const result = derived({ weight_kg: '10', length_cm: '60', width_cm: '40', height_cm: '30' });
    expect(result.volumeM3).toBe(0.072);
    expect(result.dimensionalWeightKg).toBe(12);
    expect(result.chargeableKg).toBe(12);
  });

  it('waits for all three sides', () => {
    expect(derived({ length_cm: '60', width_cm: '40' }).volumeM3).toBeNull();
  });
});

it('sends dot decimals', () => {
  expect(toPayload({ weight_kg: '2,5', length_cm: '1', width_cm: '1', height_cm: '1' }).weight_kg).toBe('2.5');
});
