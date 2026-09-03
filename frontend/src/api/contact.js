// src/api/contact.js
//
// The contact form. Write-only: the API accepts a message and returns nothing.

import { request } from './client';

/**
 * @param {{ name: string, email: string, subject: string, message: string,
 *           language: string }} enquiry
 */
export async function sendContactMessage({
  name,
  email,
  subject,
  message,
  language,
}) {
  return request('/contact/', {
    method: 'POST',
    body: { name, email, subject, message, language },
  });
}
