// src/api/quote.js
//
// The "request a quote" form. Sends multipart, because the request may carry
// an uploaded shopping list.

import { request } from './client';

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Kept in one place: the <input accept> attribute and the validation check
// must agree, or the picker allows files the form then rejects. The server
// enforces the same limits — this is only to fail fast.
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png';

/**
 * @param {{ destination: string, firstName: string, lastName: string,
 *           email: string, message: string, file: File | null,
 *           language: string }} details
 */
export async function requestQuote({
  destination,
  firstName,
  lastName,
  email,
  message,
  file,
  language,
}) {
  const formData = new FormData();
  formData.append('destination', destination);
  formData.append('first_name', firstName);
  formData.append('last_name', lastName);
  formData.append('email', email);
  formData.append('message', message ?? '');
  if (language) formData.append('language', language);
  if (file) formData.append('file', file);

  // No Content-Type header: the browser sets it, including the multipart
  // boundary. Setting it by hand is the classic way file uploads break.
  return request('/quote/', { method: 'POST', formData });
}
