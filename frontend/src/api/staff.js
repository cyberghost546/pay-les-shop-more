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
 * Customers, with their addresses and shipment counts.
 *
 * These are the same rows each customer edits on their own profile page, not
 * a back-office copy of them: a correction made here is what that customer
 * reads next time they open their profile, and an edit they make there is
 * what the next load of this list shows.
 *
 * @param {{ search?: string, erased?: string, staff?: string, ordering?: string, page?: number }} filters
 */
export async function listCustomers(filters) {
  return toPage(await request(`/staff/customers/${query(filters)}`));
}

/**
 * Corrects a customer's contact details. Answers with the whole row, so the
 * table can swap it in without refetching the page.
 *
 * Only what the office plausibly finds wrong: an agent at the destination
 * cannot arrange a handover against a mistyped phone number, and the customer
 * has no way of knowing it is mistyped. The username and the role are not in
 * here - the role has `setCustomerRole` below, where its refusals live.
 *
 * @param {number} id
 * @param {{ first_name?: string, last_name?: string, email?: string,
 *           phone_number?: string }} changes
 */
export async function updateCustomer(id, changes) {
  return request(`/staff/customers/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * Saves one of a customer's delivery addresses: with an `id` it corrects that
 * address, without one it adds it. Answers with the whole customer row.
 *
 * The same table the customer's own profile page writes to, so an address
 * fixed here is the one that pre-fills their next order.
 *
 * @param {number} id the customer
 * @param {{ id?: number|null, label?: string, street?: string,
 *           house_number?: string, postal_code?: string, city?: string,
 *           country?: string, is_default?: boolean }} address
 */
export async function saveCustomerAddress(id, address) {
  return request(`/staff/customers/${id}/address/`, {
    method: 'POST',
    body: address,
  });
}

/** The delivery countries, matching Address.Country on the server. */
export const ADDRESS_COUNTRIES = [
  { value: 'CW', label: 'Curaçao' },
  { value: 'BQ', label: 'Bonaire' },
  { value: 'AW', label: 'Aruba' },
  { value: 'SX', label: 'Sint Maarten' },
  { value: 'SR', label: 'Suriname' },
  { value: 'NL', label: 'Nederland' },
];

/**
 * Makes an account an admin, or puts it back to a plain customer. Answers with
 * the whole customer row, so the table can swap it in without a refetch.
 *
 * The server refuses your own account, a superuser and an erased one - each
 * row carries `can_change_role` saying so up front, which is what the select
 * is disabled by. That flag is a hint for the UI: the refusal itself lives on
 * the server, and holds whatever the browser sends.
 *
 * @param {number} id
 * @param {'admin' | 'customer'} role
 */
export async function setCustomerRole(id, role) {
  return request(`/staff/customers/${id}/role/`, {
    method: 'POST',
    body: { role },
  });
}

export const CUSTOMER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'customer', label: 'Customer' },
];

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

/**
 * The invoice review queue.
 *
 * An invoice is raised automatically when a package is marked paid, and it
 * lands here in `pending_review`. It becomes visible to the customer on their
 * profile page only once it has been approved and the document has rendered —
 * approving is the act that publishes it, which is why there is no "send"
 * button anywhere.
 *
 * @param {{ search?: string, status?: string, page?: number }} filters
 */
export async function listInvoices(filters) {
  // The server reads a missing status as "the queue", which is the right
  // default for an API and the wrong one for a <select> whose blank option
  // reads "Any status". Every other list in the dashboard treats blank as
  // no filter, so blank is spelled out as `all` here and the page opens on
  // the queue by starting its filter at pending_review instead.
  const status = filters?.status ? filters.status : 'all';

  return toPage(await request(`/staff/invoices/${query({ ...filters, status })}`));
}

/**
 * pending_review -> approved, which queues the PDF and, once that lands,
 * marks the invoice sent and shows it to the customer.
 *
 * Answers with the whole row. A 409 means somebody else moved it first — the
 * state machine refusing, not a malformed request.
 */
export async function approveInvoice(id) {
  return request(`/staff/invoices/${id}/approve/`, { method: 'POST' });
}

/**
 * pending_review -> rejected. The reason is required and is shown to whoever
 * corrects the invoice, so it has to say what is actually wrong.
 */
export async function rejectInvoice(id, reason) {
  return request(`/staff/invoices/${id}/reject/`, {
    method: 'POST',
    body: { rejection_reason: reason },
  });
}

/**
 * The paperwork customers have sent in: receipts, shop invoices, customs
 * forms. Staff see every customer's, which is the point of them uploading.
 *
 * @param {{ search?: string, kind?: string, unattached?: string, page?: number }} filters
 */
export async function listDocuments(filters) {
  return toPage(await request(`/documents/${query(filters)}`));
}

/**
 * Files a document against a shipment, or takes it off one when `packageId`
 * is null.
 *
 * The other half of letting a receipt arrive before the parcel does: somebody
 * uploads a till receipt the day they buy a television, the shipment is
 * booked later, and this joins the two so the document turns up on the parcel
 * where the office looks for it.
 */
export async function attachDocument(id, packageId) {
  return request(`/documents/${id}/attach/`, {
    method: 'POST',
    body: { package: packageId ?? null },
  });
}

export const DOCUMENT_KINDS = [
  { value: 'receipt', label: 'Till receipt' },
  { value: 'invoice', label: 'Shop invoice' },
  { value: 'customs', label: 'Customs form' },
  { value: 'other', label: 'Other' },
];

/**
 * Raises the invoice for a shipment that has none.
 *
 * Marking a package paid through the dashboard raises one by itself. This is
 * for the shipments that never passed through that transition — seeded rows,
 * imports, anything set in the Django admin — which otherwise have no invoice
 * and no way to get one, because every other invoice control lives on the
 * queue and an empty queue offers nothing.
 *
 * Idempotent: pressing it twice answers with the same invoice.
 */
export async function raiseInvoice(packageId) {
  return request(`/staff/packages/${packageId}/invoice/`, { method: 'POST' });
}

/**
 * Attaches a PDF to an invoice by hand, instead of waiting for the worker to
 * draw one.
 *
 * On an approved invoice this is what sends it: the document lands, the
 * invoice becomes sent, and it appears on the customer's own profile page.
 * On an already-sent invoice it replaces a wrong document without moving the
 * status and without telling the customer again.
 *
 * Anything else is refused with a 409 — an invoice still in review has not
 * been approved by anybody, and a document must not go around the queue.
 *
 * @param {number} id
 * @param {File} file the PDF, straight from the <input type="file">
 */
export async function uploadInvoiceDocument(id, file) {
  const body = new FormData();
  body.append('pdf', file);

  // formData rather than body: request() lets the browser set the multipart
  // Content-Type, boundary and all, which is the one header that must not be
  // written by hand.
  return request(`/staff/invoices/${id}/document/`, {
    method: 'POST',
    formData: body,
  });
}

// Queue first: it is where the work is, and the order the review flow runs in
// afterwards. Draft last, because nothing normally sits there.
export const INVOICE_STATUSES = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Draft' },
];
