// src/api/client.js
//
// One place that knows how to talk to the Django API: base URL, cookies and
// the CSRF header. Everything else in src/api builds on this.

const BASE_URL = '/api';

export const API_ERRORS = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  // Still used by the quote form, which has no endpoint yet.
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
};

export class ApiError extends Error {
  /**
   * @param {string} code one of API_ERRORS
   * @param {object} [fields] per-field messages from the server, if any
   */
  constructor(code, fields = null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Django will not accept a write without a CSRF token. The token lives in a
 * readable cookie, which the server sets on the first GET; if it is missing
 * (a fresh tab), ask for one before continuing.
 */
async function csrfToken() {
  const existing = readCookie('csrftoken');
  if (existing) return existing;

  await fetch(`${BASE_URL}/auth/csrf/`, { credentials: 'include' });
  return readCookie('csrftoken');
}

/**
 * @param {string} path e.g. '/auth/login/'
 * @param {{ method?: string, body?: object, formData?: FormData }} [options]
 */
export async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const isWrite = method !== 'GET' && method !== 'HEAD';

  if (isWrite) {
    const token = await csrfToken();
    if (token) headers['X-CSRFToken'] = token;
  }

  // FormData sets its own multipart Content-Type, including the boundary.
  // Setting the header by hand is the classic way file uploads break.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      // Sends and stores the session cookie.
      credentials: 'include',
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    // fetch only rejects on a network failure, never on an HTTP error status.
    throw new ApiError(API_ERRORS.UNAVAILABLE);
  }

  if (response.status === 204) return null;

  // An error page or an empty body is not JSON; that is not itself a failure.
  const data = await response.json().catch(() => null);

  if (response.ok) return data;

  if (response.status === 401) throw new ApiError(API_ERRORS.INVALID_CREDENTIALS);
  if (response.status === 403) throw new ApiError(API_ERRORS.UNAUTHENTICATED);
  if (response.status === 429) throw new ApiError(API_ERRORS.RATE_LIMITED);

  if (response.status === 400) {
    // A duplicate email comes back as a field error; the forms show a
    // dedicated message for it.
    if (data?.email) throw new ApiError(API_ERRORS.EMAIL_TAKEN, data);
    throw new ApiError(API_ERRORS.VALIDATION, data);
  }

  throw new ApiError(API_ERRORS.UNAVAILABLE);
}
