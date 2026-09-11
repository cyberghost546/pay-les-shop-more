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
 * Opens an account for somebody, from the back office.
 *
 * No password is sent, and there is nowhere to put one. The account is
 * created unusable and its owner is e-mailed a link to choose their own, so
 * nobody in the office ever knows it. That is the whole point of the feature
 * rather than a detail of it.
 *
 * Answers with the full customer row, so the table can show the new account
 * without refetching the page.
 *
 * @param {{ first_name: string, last_name: string, email: string,
 *           phone_number: string, role?: 'admin'|'warehouse'|'customer' }} details
 */
export async function createCustomer(details) {
  return request('/staff/customers/', { method: 'POST', body: details });
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
 * Moves an account between the three roles. Answers with the whole customer
 * row, so the table can swap it in without a refetch.
 *
 *   customer   no dashboard at all
 *   warehouse  the scanner and intake sheets, on a phone. Not the rest of the
 *              back office, and not Django's own /admin/
 *   admin      the whole back office
 *
 * The server refuses your own account, a superuser and an erased one - each
 * row carries `can_change_role` saying so up front, which is what the select
 * is disabled by. That flag is a hint for the UI: the refusal itself lives on
 * the server, and holds whatever the browser sends.
 *
 * @param {number} id
 * @param {'admin' | 'warehouse' | 'customer'} role
 */
export async function setCustomerRole(id, role) {
  return request(`/staff/customers/${id}/role/`, {
    method: 'POST',
    body: { role },
  });
}

// Widest first, which is the order somebody reads them in when deciding how
// much to give an account.
export const CUSTOMER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'customer', label: 'Customer' },
];

/** The word for a role value, for a row whose role cannot be changed. */
export function roleLabel(role) {
  return CUSTOMER_ROLES.find((option) => option.value === role)?.label ?? 'Customer';
}

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
  { value: 'ready_for_shipping', label: 'Ready for shipping' },
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

// The three an invoice may be raised into by hand. Draft is not offered —
// nothing reads a draft, and an invoice raised by hand is raised in order to
// go somewhere — and rejected is a verdict rather than a starting point. The
// server refuses the other two; this only decides what the form offers.
export const CREATABLE_INVOICE_STATUSES = [
  {
    value: 'sent',
    label: 'Send it to the customer now',
    hint: 'Approved in your name and published to their profile page straight away.',
  },
  {
    value: 'pending_review',
    label: 'Put it in the review queue',
    hint: 'Someone else approves it before the customer sees it.',
  },
  {
    value: 'approved',
    label: 'Approve it, but do not send yet',
    hint: 'Approved in your name. Send it later from this page.',
  },
];

/**
 * Raises an invoice by hand, with the document already in hand.
 *
 * The automatic path is untouched: an invoice still appears by itself when a
 * shipment is marked paid. This is for the shipment that never went through
 * that transition, where the office has the PDF and wants it on the
 * customer's profile.
 *
 * Both ids go up and neither is believed. The server checks the shipment
 * against the customer in the database before anything is written — see
 * InvoiceCreateSerializer — so a stale dropdown cannot put one customer's
 * invoice on another customer's shipment.
 *
 * A 409 means the shipment already has an invoice; the body carries
 * `existing_invoice` so the page can offer to open it.
 *
 * @param {{ customerId: number, packageId: number, file: File,
 *           status?: string, invoiceDate?: string }} invoice
 */
export async function createInvoice({
  customerId,
  packageId,
  file,
  status = 'sent',
  invoiceDate,
}) {
  const body = new FormData();
  body.append('customer', String(customerId));
  body.append('package', String(packageId));
  body.append('pdf', file);
  body.append('status', status);
  // Omitted rather than sent empty: the server reads a missing date as today,
  // and an empty string as a malformed one.
  if (invoiceDate) body.append('invoice_date', invoiceDate);

  // formData, so request() lets the browser write the multipart Content-Type
  // and its boundary — the one header that must never be set by hand.
  return request('/staff/invoices/', { method: 'POST', formData: body });
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
/**
 * approved -> sent, for an invoice that already carries its document.
 *
 * The other half of "approve it, but do not send yet" on the Add invoice
 * form. An invoice raised that way sits approved with its PDF attached and
 * deliberately off the customer's profile; this is what finishes it.
 *
 * A 409 means it is not in a state where sending makes sense - still in
 * review, or already sent.
 */
export async function sendInvoice(id) {
  return request(`/staff/invoices/${id}/send/`, { method: 'POST' });
}

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

// ---------------------------------------------------------------------------
// Warehouse intake sheets
//
// The paper form filled in on the floor when goods arrive, and the handover
// that follows it. Nothing here has a customer-facing counterpart: a sheet
// records what staff saw - bad packing, damage, a driver's name - and lives
// entirely behind /api/staff/.
// ---------------------------------------------------------------------------

/** @param {{ search?: string, status?: string, freight?: string, ordering?: string, page?: number }} filters */
export async function listIntakeSheets(filters) {
  return toPage(await request(`/staff/intake/${query(filters)}`));
}

/**
 * Starts a sheet. Everything is optional - a sheet begins the moment somebody
 * has a delivery in front of them, which is before they know most of it.
 *
 * @param {object} [fields]
 */
export async function createIntakeSheet(fields = {}) {
  return request('/staff/intake/', { method: 'POST', body: fields });
}

/**
 * Saves changes to a draft. Refused with a 409 once the sheet has been
 * released - at that point it is the record of a handover rather than a form.
 *
 * @param {number} id
 * @param {object} changes
 */
export async function updateIntakeSheet(id, changes) {
  return request(`/staff/intake/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * Hands the sheet to the rest of the staff and mails it to them.
 *
 * Two refusals worth telling apart, both of which the page already guards
 * against and neither of which it can rule out - somebody else may have the
 * same sheet open:
 *
 *   400 with `fields.missing`  something is still unanswered, by name
 *   409                        it has already been released
 *
 * @param {number} id
 */
export async function releaseIntakeSheet(id) {
  return request(`/staff/intake/${id}/release/`, { method: 'POST' });
}

/**
 * Looks up a code read off a package.
 *
 * Writes nothing, which is the point: a mis-scan should cost a second scan
 * and not a junk sheet somebody has to find and explain. Starting the sheet
 * is a separate, deliberate call to createIntakeSheet.
 *
 * The answer names what was found in `match`:
 *
 *   'sheet'    a sheet already exists - `sheet` carries it, open it
 *   'package'  a shipment on file with no sheet yet - `package` carries it
 *   'booking'  a booking form on file with no sheet yet - `booking` has it
 *   'none'     nothing recognised the code, which is a normal answer for
 *              goods that arrived with only a supplier's own barcode on them
 *
 * @param {string} code
 * @returns {Promise<{ code: string, match: string, sheet: object|null,
 *   package: object|null, booking: object|null }>}
 */
export async function scanCode(code) {
  return request(`/staff/intake/scan/${query({ code })}`);
}

/**
 * Puts a released sheet back into draft so a mistake can be corrected.
 *
 * Sends nothing. What tells everybody is the next release, which says in its
 * subject line that it is a correction and which version it is.
 *
 * Refused with a 409 when the sheet is already a draft - somebody else got
 * there first, and there is nothing to do.
 *
 * @param {number} id
 */
export async function reopenIntakeSheet(id) {
  return request(`/staff/intake/${id}/reopen/`, { method: 'POST' });
}

/**
 * Who a release would be mailed to right now.
 *
 * Asked for so the page can say so above the button. The quiet failure this
 * exists to prevent is a staff account with no work address on it: the sheet
 * releases, the dashboard says it did, and no inbox ever hears about it.
 *
 * @returns {Promise<{ count: number, addresses: string[] }>}
 */
export async function getIntakeRecipients() {
  return request('/staff/intake/recipients/');
}

export const INTAKE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'released', label: 'Released' },
];

export const INTAKE_FREIGHT = [
  { value: 'sea', label: 'Zeevracht' },
  { value: 'air', label: 'Luchtvracht' },
];

// The Dutch words the paper form prints, in the order it prints them.
export const INTAKE_PACKAGING = [
  { value: 'pallet', label: 'Pallet' },
  { value: 'doos', label: 'Doos' },
  { value: 'colli', label: 'Colli' },
  { value: 'kist', label: 'Kist' },
  { value: 'other', label: 'Anders…' },
];

// The Ja / Nee boxes. Blank first and blank by default: a sheet starts with
// nobody having looked, and that is not the same answer as "Nee".
export const INTAKE_CHECKS = [
  { value: '', label: 'Niet gecontroleerd' },
  { value: 'yes', label: 'Ja' },
  { value: 'no', label: 'Nee' },
];
