// src/api/shops.js
//
// The webshops the services page lists, and the office's own view of them.
//
// The public half is open to anyone. The staff half lives under /api/staff/
// and is refused with a 403 unless the session belongs to a staff account -
// the dashboard hiding the page from customers is only tidiness, the server
// is what actually holds.

import { apiUrl, request } from './client';

/**
 * The active shops, in the order the office arranged them.
 *
 * @returns {Promise<{id: number, name: string, url: string, logo: string|null,
 *   description: string}[]>} `logo` is an API path, not a full URL - run it
 *   through logoUrl() before putting it in an <img>.
 */
export async function listShops() {
  const data = await request('/shops/');
  // The public route is deliberately unpaginated, but a defensive unwrap
  // costs nothing and means turning pagination on later cannot blank the page.
  return Array.isArray(data) ? data : (data?.results ?? []);
}

/**
 * The full address of a shop's logo, for the <img> that shows it.
 *
 * @param {string|null} path the `logo` field from a shop row
 */
export function logoUrl(path) {
  return path ? apiUrl(path) : null;
}

/* -------------------------------------------------------------- the office */

/** Every shop, hidden ones included. @param {{search?: string}} [filters] */
export async function listAllShops(filters = {}) {
  const search = filters.search?.trim();
  const data = await request(`/staff/shops/${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  return Array.isArray(data) ? data : (data?.results ?? []);
}

/**
 * How a shop travels: as multipart when it carries a new logo, as JSON when
 * it does not.
 *
 * A File cannot be JSON, so a row with a logo has to be a form. A row without
 * one stays JSON so that editing a name does not re-upload the picture - and
 * so that clearing the logo, which is `null` rather than a file, is not
 * flattened into the string "null" by FormData.
 *
 * request() takes the two by different names: `formData` is passed through to
 * fetch untouched, `body` is stringified and labelled application/json.
 */
function asRequest(method, changes) {
  if (!(changes.logo instanceof File)) return { method, body: changes };

  const form = new FormData();

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === null) continue;
    form.append(key, value instanceof File ? value : String(value));
  }

  return { method, formData: form };
}

export async function createShop(shop) {
  return request('/staff/shops/', asRequest('POST', shop));
}

export async function updateShop(id, changes) {
  // PATCH, so an edit only sends what changed and cannot blank a field it
  // never asked about.
  return request(`/staff/shops/${id}/`, asRequest('PATCH', changes));
}

/**
 * Set the running order of every shop.
 *
 * The whole list rather than the two rows a move affects: swapping a pair
 * breaks when both carry the same number, and one request either applies or
 * does not where two can leave the list half-moved.
 *
 * @param {number[]} ids every shop's id, in the order they should appear
 */
export async function reorderShops(ids) {
  return request('/staff/shops/reorder/', { method: 'POST', body: { ids } });
}

export async function deleteShop(id) {
  return request(`/staff/shops/${id}/`, { method: 'DELETE' });
}
