// src/api/warehouse.js
//
// The warehouse floor's package operations: scan, measure, pack, report
// damage, and the activity trail they leave. All under /api/staff/warehouse/,
// open to warehouse workers and the office, and checked on the server - the
// worker is always the signed-in account, never something sent from here.
//
// The shipment list, board and stage moves predate this file and stay in
// api/staff.js.

import { request } from './client';

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined) continue;
    search.set(key, String(value));
  }
  const string = search.toString();
  return string ? `?${string}` : '';
}

function toPage(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };
  return {
    results: data?.results ?? [],
    count: data?.count ?? 0,
    hasNext: Boolean(data?.next),
    hasPrevious: Boolean(data?.previous),
  };
}

const SHIPMENTS = '/staff/warehouse/shipments';

/** Records that the worker scanned this package. Answers with the shipment. */
export async function recordScan(id, code = '') {
  return request(`${SHIPMENTS}/${id}/scanned/`, { method: 'POST', body: { code } });
}

/** Moves the package to a warehouse stage. 403 if the role may not set it. */
export async function moveStage(id, stage) {
  return request(`${SHIPMENTS}/${id}/stage/`, { method: 'POST', body: { stage } });
}

/** Sets the rack/shelf location. Blank clears it. */
export async function setLocation(id, location) {
  return request(`${SHIPMENTS}/${id}/location/`, { method: 'POST', body: { location } });
}

/**
 * Saves a measurement. The server computes volume and dimensional weight.
 *
 * @param {number} id
 * @param {{ weight_kg: string, length_cm: string, width_cm: string, height_cm: string }} values
 * @returns {Promise<{ measurement: object, shipment: object }>}
 */
export async function saveMeasurement(id, values) {
  return request(`${SHIPMENTS}/${id}/measurements/`, { method: 'POST', body: values });
}

export async function listPackageMeasurements(id) {
  return request(`${SHIPMENTS}/${id}/measurements/`);
}

/**
 * @param {number} id
 * @param {{ packaging_type: string, quantity: number, notes?: string }} values
 * @returns {Promise<{ packaging: object, shipment: object }>}
 */
export async function addPackaging(id, values) {
  return request(`${SHIPMENTS}/${id}/packaging/`, { method: 'POST', body: values });
}

export async function listPackagePackaging(id) {
  return request(`${SHIPMENTS}/${id}/packaging/`);
}

/**
 * Files a damage report with up to six photos.
 *
 * @param {number} id
 * @param {{ damage_type: string, description: string, photos: File[] }} report
 * @returns {Promise<{ damage_report: object, shipment: object }>}
 */
export async function reportDamage(id, { damage_type, description, photos = [] }) {
  const body = new FormData();
  body.append('damage_type', damage_type);
  body.append('description', description);
  for (const photo of photos) body.append('photos', photo);
  return request(`${SHIPMENTS}/${id}/damage/`, { method: 'POST', formData: body });
}

export async function listPackageDamage(id) {
  return request(`${SHIPMENTS}/${id}/damage/`);
}

/** The package's timeline, oldest first. */
export async function getPackageTimeline(id) {
  return request(`${SHIPMENTS}/${id}/activity/`);
}

/** @param {{ mine?: string, today?: string, package?: number, action?: string, page?: number }} filters */
export async function listActivity(filters) {
  return toPage(await request(`/staff/warehouse/activity/${query(filters)}`));
}

/** @param {{ mine?: string, today?: string, page?: number }} filters */
export async function listMeasurements(filters) {
  return toPage(await request(`/staff/warehouse/measurements/${query(filters)}`));
}

/** @param {{ mine?: string, today?: string, page?: number }} filters */
export async function listPackaging(filters) {
  return toPage(await request(`/staff/warehouse/packaging/${query(filters)}`));
}

/** @param {{ status?: 'open'|'resolved', page?: number }} filters */
export async function listDamageReports(filters) {
  return toPage(await request(`/staff/warehouse/damage/${query(filters)}`));
}

export async function resolveDamageReport(id, note) {
  return request(`/staff/warehouse/damage/${id}/resolve/`, { method: 'POST', body: { note } });
}

export const PACKAGING_TYPES = [
  { value: 'bubble_wrap', label: 'Bubble wrap' },
  { value: 'tape', label: 'Tape' },
  { value: 'box', label: 'Box' },
  { value: 'protection', label: 'Protection' },
  { value: 'other', label: 'Other' },
];

export const DAMAGE_TYPES = [
  { value: 'box_damaged', label: 'Box damaged' },
  { value: 'contents_damaged', label: 'Contents damaged' },
  { value: 'wet_package', label: 'Wet package' },
  { value: 'broken_packaging', label: 'Broken packaging' },
  { value: 'other', label: 'Other' },
];

// Mirrors warehouse/models.py. The server re-checks every one.
export const MEASUREMENT_LIMITS = {
  weight_kg: { min: 0.01, max: 5000, places: 2, unit: 'kg', label: 'Weight' },
  length_cm: { min: 0.1, max: 1500, places: 1, unit: 'cm', label: 'Length' },
  width_cm: { min: 0.1, max: 1500, places: 1, unit: 'cm', label: 'Width' },
  height_cm: { min: 0.1, max: 1500, places: 1, unit: 'cm', label: 'Height' },
};

// IATA volumetric divisor, the same as the server's VOLUMETRIC_DIVISOR.
export const VOLUMETRIC_DIVISOR = 6000;

/** The first server message for a field, if any. */
export function fieldError(error, field) {
  const messages = error?.fields?.[field];
  return Array.isArray(messages) ? messages[0] : messages || '';
}

/** A sentence for the worker from any failed request. */
export function errorMessage(error, fallback = 'That did not save. Check the connection and try again.') {
  const detail = error?.fields?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (error?.status === 403) return 'Your account is not allowed to do that.';
  if (error?.status === 404) return 'That package could not be found.';
  return fallback;
}
