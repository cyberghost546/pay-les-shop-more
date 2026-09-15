// src/pages/Warehouse/measurement.js
//
// The live figures under the measurement form, and the checks run before
// saving. The server recomputes and re-validates everything; these exist so
// the worker sees a mistake while the tape measure is still in their hand.

import { MEASUREMENT_LIMITS, VOLUMETRIC_DIVISOR } from '../../api/warehouse';

export const MEASUREMENT_FIELDS = ['weight_kg', 'length_cm', 'width_cm', 'height_cm'];

/** "12,5" and "12.5" are both twelve and a half. Blank or junk is null. */
export function parseNumber(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** An error sentence for one field, or '' when it is fine. */
export function validateField(field, raw) {
  const limits = MEASUREMENT_LIMITS[field];
  if (String(raw ?? '').trim() === '') return `${limits.label} is required.`;

  const value = parseNumber(raw);
  if (value === null) return `${limits.label} must be a number.`;
  if (value < limits.min || value > limits.max) {
    return `${limits.label} must be between ${limits.min} and ${limits.max} ${limits.unit}.`;
  }
  const decimals = String(raw).trim().replace(',', '.').split('.')[1] ?? '';
  if (decimals.length > limits.places) {
    return `${limits.label}: at most ${limits.places} decimal place${limits.places === 1 ? '' : 's'}.`;
  }
  return '';
}

/** Every field's error, keyed by field, for the ones that have one. */
export function validateMeasurement(values) {
  const errors = {};
  for (const field of MEASUREMENT_FIELDS) {
    const message = validateField(field, values[field]);
    if (message) errors[field] = message;
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
