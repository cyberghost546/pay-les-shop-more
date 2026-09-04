// src/api/tracking.js
//
// The two endpoints the homepage calls without anyone being signed in:
// looking up a shipment, and the counts in the statistics band.
//
// The tracking lookup deliberately answers with very little — status,
// destination island, progress — and never with the recipient or the address.
// See backend/accounts/public.py for why.

import { API_ERRORS, ApiError, request } from './client';

export const TRACKING_ERRORS = {
  ...API_ERRORS,
  NOT_FOUND: 'NOT_FOUND',
};

/**
 * @param {string} trackingNumber as typed, including any stray spaces — the
 *   server trims and matches case-insensitively, because this is copied off a
 *   label or out of an e-mail.
 * @returns {Promise<object>} the shipment
 * @throws {ApiError} with code NOT_FOUND when there is no such shipment
 */
export async function trackShipment(trackingNumber) {
  const number = trackingNumber.trim();

  try {
    return await request(`/track/${encodeURIComponent(number)}/`);
  } catch (error) {
    // The client maps 404 to UNAVAILABLE, which would tell the visitor the
    // site is broken when in fact their number simply is not one of ours.
    if (error.code === API_ERRORS.UNAVAILABLE && error.status === 404) {
      throw new ApiError(TRACKING_ERRORS.NOT_FOUND);
    }
    throw error;
  }
}

/** Real counts for the homepage statistics band. */
export async function getSiteStats() {
  return request('/stats/');
}
