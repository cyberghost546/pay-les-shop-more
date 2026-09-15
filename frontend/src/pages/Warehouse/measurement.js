// src/pages/Warehouse/measurement.js
//
// The live figures under the measurement form, and the checks run before
// saving. The server recomputes and re-validates everything; these exist so
// the worker sees a mistake while the tape measure is still in their hand.

import { MEASUREMENT_LIMITS, VOLUMETRIC_DIVISOR } from '../../api/warehouse';
import { fill } from '../../i18n/fill';

export const MEASUREMENT_FIELDS = ['weight_kg', 'length_cm', 'width_cm', 'height_cm'];

// Used when no translator is passed, which keeps these pure functions easy to
// test on their own.
const ENGLISH = {
  required: '{field} is required.',
  number: '{field} must be a number.',
  range: '{field} must be between {min} and {max} {unit}.',
  places: '{field}: at most {places} decimal place(s).',
};

/** "12,5" and "12.5" are both twelve and a half. Blank or junk is null. */
export function parseNumber(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * An error sentence for one field, or '' when it is fine.
 *
 * @param {string} field
 * @param {string} raw
 * @param {(key: string) => string} [t] the translator; English without one
 */
export function validateField(field, raw, t) {
  const limits = MEASUREMENT_LIMITS[field];
  const message = (key, values) =>
    fill(t ? t(`dashboard.flow.measure.${key}`) : ENGLISH[key], {
      field: t ? t(`dashboard.flow.measure.fields.${field}`) : limits.label,
      ...values,
    });

  if (String(raw ?? '').trim() === '') return message('required');

  const value = parseNumber(raw);
  if (value === null) return message('number');
  if (value < limits.min || value > limits.max) {
    return message('range', { min: limits.min, max: limits.max, unit: limits.unit });
  }
  const decimals = String(raw).trim().replace(',', '.').split('.')[1] ?? '';
  if (decimals.length > limits.places) return message('places', { places: limits.places });
  return '';
}

/** Every field's error, keyed by field, for the ones that have one. */
export function validateMeasurement(values, t) {
  const errors = {};
  for (const field of MEASUREMENT_FIELDS) {
    const text = validateField(field, values[field], t);
    if (text) errors[field] = text;
  }
  return errors;
}

/**
 * Volume in m³ and dimensional weight in kg, or nulls until all three sides
 * are valid numbers.
 */
export function derived(values) {
  const sides = ['length_cm', 'width_cm', 'height_cm'].map((field) => parseNumber(values[field]));
  if (sides.some((side) => side === null || side <= 0)) {
    return { volumeM3: null, dimensionalWeightKg: null, chargeableKg: null };
  }
  const cubicCm = sides[0] * sides[1] * sides[2];
  const dimensionalWeightKg = Math.round((cubicCm / VOLUMETRIC_DIVISOR) * 100) / 100;
  const weight = parseNumber(values.weight_kg);
  return {
    volumeM3: Math.round((cubicCm / 1_000_000) * 10_000) / 10_000,
    dimensionalWeightKg,
    chargeableKg: weight === null ? null : Math.max(weight, dimensionalWeightKg),
  };
}

/** The values as the API wants them: dot decimals, trimmed. */
export function toPayload(values) {
  return Object.fromEntries(
    MEASUREMENT_FIELDS.map((field) => [field, String(values[field] ?? '').trim().replace(',', '.')]),
  );
}
