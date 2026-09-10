// src/api/documents.js
//
// The paperwork a customer sends in: the receipt for what they bought, the
// shop's invoice, a customs form. The opposite direction to src/api/invoices,
// which is what the business sends out.
//
// The server decides whose these are from the session cookie. A shipment id
// does go up with an upload — it has to, since the file belongs to one parcel
// — and the server checks it against the caller rather than trusting it, so a
// tampered id is refused rather than filing a receipt under a stranger's name.

import { request } from './client';

/** Maps the API's snake_case onto the shape the pages render. */
function toDocument(data) {
  return {
    id: data.id,
    // Null when the file is not tied to a shipment, which is allowed: the
    // receipt exists before the parcel does.
    packageId: data.package,
    trackingNumber: data.tracking_number,
    customerName: data.customer_name,
    kind: data.kind,
    kindLabel: data.kind_display,
    note: data.note ?? '',
    // The name the customer's own machine gave it, scrubbed by the server.
    filename: data.filename,
    contentType: data.content_type,
    sizeBytes: data.size_bytes,
    uploadedByName: data.uploaded_by_name,
    // Points at the API view that checks the session, never at /media: a
    // receipt carries a name, an address and what somebody bought.
    downloadUrl: data.download_url,
    createdAt: data.created_at,
    // True when the server declined to file this against the shipment that
    // was asked for, because that shipment has already gone. The upload still
    // succeeded; it is simply unfiled, and belongs to whatever shipment
    // carries it next. See accounts/views.py.
    filedSeparately: Boolean(data.filed_separately),
    detail: data.detail ?? '',
  };
}

/** Everything the caller may see, newest first. */
export async function listDocuments(packageId) {
  const query = packageId ? `?package=${encodeURIComponent(packageId)}` : '';
  const data = await request(`/documents/${query}`);
  return (data.results ?? data).map(toDocument);
}

/**
 * @param {{ packageId?: number|null, file: File, kind?: string, note?: string }} upload
 */
export async function uploadDocument({ packageId, file, kind = 'receipt', note = '' }) {
  const body = new FormData();
  // Omitted rather than sent empty when there is no shipment: the server
  // reads a missing package as "not tied to one", and an empty string as a
  // shipment id it cannot find.
  if (packageId) body.append('package', packageId);
  body.append('file', file);
  body.append('kind', kind);
  if (note) body.append('note', note);

  // formData rather than body: request() then lets the browser set the
  // multipart Content-Type, boundary and all, which is the one header that
  // must never be written by hand.
  return toDocument(await request('/documents/', { method: 'POST', formData: body }));
}

/** Withdraws an upload. The file goes with the row, not just the record. */
export async function deleteDocument(id) {
  return request(`/documents/${id}/`, { method: 'DELETE' });
}
