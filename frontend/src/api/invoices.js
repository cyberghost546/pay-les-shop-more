// src/api/invoices.js
//
// The signed-in customer's invoices. Like the rest of src/api, the server
// works out whose they are from the session cookie — no customer id is ever
// sent from the browser, so there is no id to tamper with.

import { request } from './client';

/** Maps the API's snake_case onto the shape the profile page renders. */
function toInvoice(data) {
  return {
    id: data.id,
    // The human-facing reference, e.g. INV-2026-00012. Built by the server so
    // the number on screen is the number printed on the document.
    number: data.number,
    trackingNumber: data.tracking_number,
    description: data.description ?? '',
    // A string, not a Number: these are euro amounts and the API sends them as
    // decimals for a reason. Formatting happens at the point of display.
    valueEur: data.value_eur,
    // The date on the document, which is not always the day it was sent: an
    // invoice raised by the office on Monday for Friday's shipment carries
    // Friday. The profile page shows this one, so the list and the PDF the
    // customer downloads agree.
    datedOn: data.dated_on,
    sentAt: data.sent_at,
    // Points at the API view that checks the session, never at /media. The
    // PDF is a document with somebody's name, address and shipment value on
    // it, so it is not something a guessed filename should reach.
    downloadUrl: data.download_url,
  };
}

/**
 * Every invoice that has been sent to the customer, newest first. Invoices
 * still in review are not listed — the server does that filtering, this is
 * only the shape.
 */
export async function listInvoices() {
  const data = await request('/invoices/');
  return (data.results ?? data).map(toInvoice);
}
