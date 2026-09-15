// src/api/driver.js
//
// The driver's deliveries, /api/driver/deliveries/. Drivers and office staff
// only; the server checks on every request.

import { request } from './client';

/** @param {{ view?: 'today', search?: string }} [filters] */
export async function listDeliveries(filters = {}) {
  const params = new URLSearchParams();
  if (filters.view) params.set('view', filters.view);
  if (filters.search) params.set('search', filters.search);
  params.set('page_size', '200');
  const data = await request(`/driver/deliveries/?${params}`);
  return data?.results ?? data ?? [];
}

/**
 * Marks a shipment delivered. The server records the driver from the session.
 *
 * @param {number} id
 * @param {{ recipientName: string, note?: string, photo?: File|null }} details
 */
export async function markDelivered(id, { recipientName, note = '', photo = null }) {
  const body = new FormData();
  body.append('recipient_name', recipientName);
  body.append('note', note);
  if (photo) body.append('photo', photo);
  return request(`/driver/deliveries/${id}/deliver/`, { method: 'POST', formData: body });
}
