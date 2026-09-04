// src/api/auth.js
//
// Authentication against the Django API. The credential is an HttpOnly
// session cookie set by the server — nothing here ever holds a token, so an
// XSS bug has nothing to steal.

import { API_ERRORS, ApiError, request } from './client';

// Kept for the pages that already import these names.
export const AUTH_ERRORS = API_ERRORS;
export const AuthError = ApiError;

/**
 * @param {{ email: string, password: string, remember: boolean }} credentials
 * @returns {Promise<object>} the signed-in user
 */
export async function signIn({ email, password }) {
  // The API authenticates on username. The login form asks for an e-mail
  // address, and signup sets username to the e-mail, so they line up.
  return request('/auth/login/', {
    method: 'POST',
    body: { username: email, password },
  });
}

/**
 * @param {{ firstName: string, lastName: string, email: string,
 *           phone: string, password: string }} details
 */
export async function signUp({ firstName, lastName, email, phone, password }) {
  return request('/auth/signup/', {
    method: 'POST',
    body: {
      // No separate username field on the form, so the e-mail doubles as one.
      username: email,
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phone,
      password,
    },
  });
}

export async function signOut() {
  return request('/auth/logout/', { method: 'POST' });
}

/**
 * Step one of a reset: ask for the e-mail with the link in it.
 *
 * Succeeds whether or not the address belongs to an account — the server
 * answers identically either way, so that this cannot be used to find out who
 * has registered. The page says "if that address is registered…" for the same
 * reason, and must not be changed to promise that a mail is on its way.
 *
 * @param {{ email: string, language?: string }} details
 */
export async function requestPasswordReset({ email, language }) {
  return request('/auth/password-reset/', {
    method: 'POST',
    // The mail is written in whichever language the visitor is reading.
    body: { email, language: language ?? '' },
  });
}

/**
 * Step two: the new password, with the two halves of the link.
 *
 * @param {{ uid: string, token: string, password: string }} details
 */
export async function confirmPasswordReset({ uid, token, password }) {
  return request('/auth/password-reset/confirm/', {
    method: 'POST',
    body: { uid, token, new_password: password },
  });
}
