// src/api/profile.js
//
// The signed-in customer's profile, addresses and packages. The server
// identifies the customer from the session cookie — no id is ever sent from
// the browser, which is what makes it impossible to read someone else's data.

import { request } from './client';

// The placeholder data is gone; the profile page now reads the real thing.
export const USING_PLACEHOLDER_DATA = false;

/** Maps the API's snake_case onto the shape the Profile page renders. */
function toProfile(data) {
  const address = data.addresses?.find((item) => item.is_default) ?? {};

  return {
    name: [data.first_name, data.last_name].filter(Boolean).join(' '),
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    email: data.email ?? '',
    phone: data.phone_number ?? '',
    street: [address.street, address.house_number].filter(Boolean).join(' '),
    postalCode: address.postal_code ?? '',
    city: address.city ?? '',
    country: address.country ?? 'CW',
    addressId: address.id ?? null,
    memberSince: data.date_joined,
    // Decides whether the header shows a link to the dashboard. Not a
    // permission: the staff API checks the flag itself on every request.
    isStaff: Boolean(data.is_staff),
    addresses: data.addresses ?? [],
    notifications: {
      shipping: data.notify_shipping ?? true,
      offers: data.notify_offers ?? false,
      newsletter: data.notify_newsletter ?? false,
    },
  };
}

export async function getProfile() {
  return toProfile(await request('/profile/'));
}

/** @param {{ name?: string, email?: string, phone?: string }} changes */
export async function updateProfile(changes) {
  const body = {};

  if (changes.name !== undefined) {
    // The API stores the two halves separately. Everything after the first
    // space is the surname — imperfect for compound names, but it round-trips.
    const [first, ...rest] = changes.name.trim().split(/\s+/);
    body.first_name = first ?? '';
    body.last_name = rest.join(' ');
  }

  if (changes.email !== undefined) body.email = changes.email;
  if (changes.phone !== undefined) body.phone_number = changes.phone;

  return toProfile(await request('/profile/', { method: 'PATCH', body }));
}

/** @param {{ currentPassword: string, newPassword: string }} passwords */
export async function changePassword({ currentPassword, newPassword }) {
  return request('/profile/password/', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

/**
 * Saves the profile page's single address block: patches the customer's
 * default address, or creates one if they have none yet.
 *
 * @param {{ addressId: number|null, street: string, postalCode: string,
 *           city: string, country: string }} address
 */
export async function saveDefaultAddress({
  addressId,
  street,
  postalCode,
  city,
  country,
}) {
  // The API stores street and house number separately; the form asks for one
  // line. Treat a trailing token containing a digit as the house number.
  const trimmed = street.trim();
  const match = trimmed.match(/^(.*?)\s+(\S*\d\S*)$/);

  const body = {
    street: match ? match[1] : trimmed,
    house_number: match ? match[2] : '',
    postal_code: postalCode,
    city,
    country,
    is_default: true,
  };

  return addressId
    ? request(`/addresses/${addressId}/`, { method: 'PATCH', body })
    : request('/addresses/', { method: 'POST', body });
}

export async function listAddresses() {
  const data = await request('/addresses/');
  return data.results ?? data;
}

export async function createAddress(address) {
  return request('/addresses/', { method: 'POST', body: address });
}

export async function updateAddress(id, address) {
  return request(`/addresses/${id}/`, { method: 'PATCH', body: address });
}

export async function deleteAddress(id) {
  return request(`/addresses/${id}/`, { method: 'DELETE' });
}

export async function listPackages() {
  const data = await request('/packages/');
  return data.results ?? data;
}

/** @param {{ notifications: {shipping: boolean, offers: boolean, newsletter: boolean} }} preferences */
export async function updateNotifications({ notifications }) {
  return toProfile(
    await request('/profile/', {
      method: 'PATCH',
      body: {
        notify_shipping: notifications.shipping,
        notify_offers: notifications.offers,
        notify_newsletter: notifications.newsletter,
      },
    }),
  );
}

/**
 * Erases the account. Returns { anonymised: true } when shipment records had
 * to be kept — personal data is stripped either way.
 *
 * @param {{ currentPassword: string }} confirmation
 */
export async function deleteAccount({ currentPassword }) {
  return request('/profile/delete/', {
    method: 'POST',
    body: { current_password: currentPassword },
  });
}
