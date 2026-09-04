// src/api/booking.js
//
// The digital booking form (boekingsbon). Submitting is all this does — the
// endpoint is write-only, so nothing here can read somebody else's booking.

import { request } from './client';

export const FREIGHT = [
  { value: 'sea', labelKey: 'booking.freight.sea' },
  { value: 'air', labelKey: 'booking.freight.air' },
];

// Matches Booking.Destination on the server. "other" opens a free-text box.
export const DESTINATIONS = [
  { value: 'AW', label: 'Aruba' },
  { value: 'BQ', label: 'Bonaire' },
  { value: 'CW', label: 'Curaçao' },
  { value: 'SX', label: 'Sint Maarten' },
  { value: 'SR', label: 'Suriname' },
  { value: 'other', labelKey: 'booking.destinationOther' },
];

export const PACKING = [
  { value: 'sender', labelKey: 'booking.packing.sender' },
  { value: 'company', labelKey: 'booking.packing.company' },
];

export const PAYMENT = [
  { value: 'bank', labelKey: 'booking.payment.bank' },
  { value: 'cash', labelKey: 'booking.payment.cash' },
];

export const UNITS = [
  { value: 'boxes', labelKey: 'booking.units.boxes' },
  { value: 'pallets', labelKey: 'booking.units.pallets' },
  { value: 'colli', labelKey: 'booking.units.colli' },
];

export const VEHICLES = [
  { value: 'na', labelKey: 'booking.vehicle.na' },
  { value: 'combustion', labelKey: 'booking.vehicle.combustion' },
  { value: 'electric', labelKey: 'booking.vehicle.electric' },
];

/**
 * @param {object} booking the sender's half of the form
 * @returns {Promise<{id: number, created_at: string}>} the reference only
 */
export async function submitBooking(booking) {
  return request('/bookings/', { method: 'POST', body: booking });
}
