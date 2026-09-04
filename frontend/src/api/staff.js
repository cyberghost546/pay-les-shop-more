// src/api/staff.js
//
// The back-office API, /api/staff/. Every route here is refused with a 403
// unless the session belongs to a staff account — the dashboard hiding itself
// from customers is only tidiness, this is what actually holds.

import { request } from './client';

/** Turns `{ status: 'new', search: '' }` into `?status=new`, dropping blanks. */
function query(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // `false` is a real value for `handled`, so only empty and null go.
    if (value === '' || value === null || value === undefined) continue;
    search.set(key, String(value));
  }

  const string = search.toString();
  return string ? `?${string}` : '';
}

/**
 * DRF pages every list. Normalising here means the pages render one shape and
 * never have to care whether pagination happened to be on.
 */
function toPage(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };

  return {
    results: data?.results ?? [],
    count: data?.count ?? 0,
    hasNext: Boolean(data?.next),
    hasPrevious: Boolean(data?.previous),
  };
}

/**
 * Counts, recent activity and the daily series behind the chart.
 *
 * @param {number} [days] how far back the chart reaches. The server accepts
 *   7, 30 or 90 and falls back to 30 for anything else, so a stale value here
 *   degrades to the default rather than erroring.
 */
export async function getOverview(days) {
  return request(`/staff/overview/${query({ days })}`);
}

/** @param {{ search?: string, status?: string, destination?: string, ordering?: string, page?: number }} filters */
export async function listQuotes(filters) {
  return toPage(await request(`/staff/quotes/${query(filters)}`));
}

export async function updateQuote(id, changes) {
  return request(`/staff/quotes/${id}/`, { method: 'PATCH', body: changes });
}

/** @param {{ search?: string, handled?: boolean, ordering?: string, page?: number }} filters */
export async function listMessages(filters) {
  return toPage(await request(`/staff/messages/${query(filters)}`));
}

export async function updateMessage(id, changes) {
  return request(`/staff/messages/${id}/`, { method: 'PATCH', body: changes });
}

/** @param {{ search?: string, status?: string, ordering?: string, page?: number }} filters */
export async function listPackages(filters) {
  return toPage(await request(`/staff/packages/${query(filters)}`));
}

/**
 * Booking forms submitted by customers. Only the office half is writable —
 * what the sender declared is a record of what they said.
 *
 * @param {{ search?: string, status?: string, destination?: string, freight?: string, ordering?: string, page?: number }} filters
 */
export async function listBookings(filters) {
  return toPage(await request(`/staff/bookings/${query(filters)}`));
}

export async function updateBooking(id, changes) {
  return request(`/staff/bookings/${id}/`, { method: 'PATCH', body: changes });
}

export const BOOKING_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'booked_in', label: 'Booked in' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Customers, with their addresses and shipment counts. Read-only: the API
 * offers no write here, because changing somebody's personal data belongs in
 * the Django admin rather than in a list screen.
 *
 * @param {{ search?: string, erased?: string, staff?: string, ordering?: string, page?: number }} filters
 */
export async function listCustomers(filters) {
  return toPage(await request(`/staff/customers/${query(filters)}`));
}

export async function updatePackage(id, changes) {
  return request(`/staff/packages/${id}/`, { method: 'PATCH', body: changes });
}

// The choice lists, kept next to the API rather than in each page: they have
// to match the models' TextChoices, so one copy is easier to keep honest.
export const QUOTE_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'quoted', label: 'Quote sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];

export const PACKAGE_STATUSES = [
  { value: 'quoted', label: 'Quote sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'purchased', label: 'Products purchased' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived at destination' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];
