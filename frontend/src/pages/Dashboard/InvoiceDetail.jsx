// src/pages/Dashboard/InvoiceDetail.jsx
//
// One invoice, opened from the View button on the table.
//
// Everything here is already on the row the table rendered, so this makes no
// request of its own: opening the details of an invoice you are looking at
// should not be able to fail, and a spinner over data already in hand is a
// delay invented for its own sake.
//
// The panel exists because the table cannot show the pairing in full and the
// pairing is what somebody checking an invoice is checking. Whose it is, which
// shipment it is for, where that shipment went, who raised it and when — laid
// out side by side, with the document itself underneath.

import { Link } from 'react-router-dom';
import { formatDate, formatDateTime, formatMoney } from './format';
import styles from './Dashboard.module.css';

/** One label and its value, or a dash when there is nothing to show. */
function Fact({ label, children, wide = false }) {
  return (
    <div className={wide ? styles.detailWide : undefined}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

/**
 * @param {{ invoice: object, onClose: () => void }} props
 */
export default function InvoiceDetail({ invoice, onClose }) {
  return (
    <section className={styles.detail} aria-labelledby="invoice-detail-title">
      <div className={styles.detailHead}>
        <h2 className={styles.detailTitle} id="invoice-detail-title">
          {invoice.number}
        </h2>
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Close
        </button>
      </div>

      <dl className={styles.detailGrid}>
        <Fact label="Invoice number">{invoice.number}</Fact>
        <Fact label="Invoice status">{invoice.status_display}</Fact>
        <Fact label="Invoice date">{formatDate(invoice.dated_on)}</Fact>
        <Fact label="Amount">{formatMoney(invoice.value_eur)}</Fact>

        <Fact label="Customer">
          <Link
            className={styles.link}
            to={`/dashboard/customers?search=${encodeURIComponent(
              invoice.customer_email ?? invoice.customer,
            )}`}
          >
            {invoice.customer}
          </Link>
        </Fact>
        <Fact label="Customer ID">{invoice.customer_id}</Fact>
        <Fact label="E-mail">{invoice.customer_email}</Fact>

        <Fact label="Tracking number">
          <Link
            className={styles.link}
            to={`/dashboard/packages?search=${encodeURIComponent(
              invoice.tracking_number,
            )}`}
          >
            {invoice.tracking_number}
          </Link>
        </Fact>
        <Fact label="Shipment status">{invoice.shipment_status}</Fact>
        <Fact label="Destination">{invoice.destination}</Fact>

        <Fact label="Created">{formatDateTime(invoice.created_at)}</Fact>
        <Fact label="Created by">
          {/* Null when nothing but a paid shipment caused it. Said in words
              rather than left blank, which would read as missing data. */}
          {invoice.created_by_name ?? 'Raised automatically'}
        </Fact>
        <Fact label="Reviewed by">
          {invoice.reviewed_by_name
            ? `${invoice.reviewed_by_name} · ${formatDateTime(invoice.reviewed_at)}`
            : ''}
        </Fact>

        {invoice.status === 'sent' && (
          <Fact label="On the customer's profile since" wide>
            {formatDateTime(invoice.sent_at)}
          </Fact>
        )}

        {invoice.rejection_reason && (
          <Fact label="Why it was rejected" wide>
            {invoice.rejection_reason}
          </Fact>
        )}
      </dl>

      {invoice.pdf_url ? (
        <>
          <div className={styles.modalActions}>
            <a
              className={styles.primaryButton}
              href={invoice.pdf_url}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          </div>

          {/* The document itself, in place. The route behind it checks the
              session on every request, so this is the same guarded URL the
              download button uses and not a media path. */}
          <iframe
            className={styles.pdfPreview}
            src={invoice.pdf_url}
            title={`Invoice ${invoice.number}`}
          />
        </>
      ) : (
        <p className={styles.mutedCell}>
          There is no document on this invoice yet. Upload one from the table
          above to send it.
        </p>
      )}
    </section>
  );
}
