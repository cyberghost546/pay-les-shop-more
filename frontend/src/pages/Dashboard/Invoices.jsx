// src/pages/Dashboard/Invoices.jsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  INVOICE_STATUSES,
  approveInvoice,
  listInvoices,
  rejectInvoice,
  uploadInvoiceDocument,
} from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDateTime, formatMoney } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

const TONES = {
  draft: 'off',
  pending_review: 'attention',
  approved: 'progress',
  rejected: 'off',
  sent: 'done',
};

// The reject form asks for a reason, and the model refuses a blank one. This
// is only so the refusal arrives as a disabled button rather than as a 400
// from the server.
const MIN_REASON_LENGTH = 3;

// Which invoices accept a document.
//
//   pending_review — uploading approves it in your name and sends it, in one
//       step. The decision is not skipped, it is recorded: you are the
//       reviewer on the row afterwards.
//   approved — reviewed already, waiting for a document.
//   sent — the customer has one and it is wrong.
//
// Draft and rejected are refused by the server; this only decides whether to
// draw the control.
const ACCEPTS_DOCUMENT = ['pending_review', 'approved', 'sent'];

/**
 * "Upload PDF", as a real file input dressed as a button.
 *
 * A hidden input inside a <label> rather than a button that clicks a hidden
 * input by ref: the label already opens the picker, keyboard and screen
 * reader included, so the ref version would be re-implementing what the
 * browser does correctly for free.
 */
function UploadButton({ invoice, busy, onPick }) {
  // Named for what pressing it does, not for what it takes. From the queue
  // the upload also approves and sends, and a button labelled "Upload PDF"
  // would not have said so.
  const LABELS = {
    pending_review: 'Upload & send',
    approved: 'Upload PDF',
    sent: 'Replace PDF',
  };

  return (
    <label className={styles.uploadButton}>
      <input
        type="file"
        className={styles.uploadInput}
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          // Reset first, or picking the same file twice in a row fires no
          // change event the second time and the upload silently does not
          // happen.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      {busy ? 'Uploading…' : (LABELS[invoice.status] ?? 'Upload PDF')}
    </label>
  );
}

/**
 * The reject box, opened from a row. Deliberately a form rather than a
 * window.prompt: the reason is shown to whoever corrects the invoice, so it is
 * worth typing properly and worth being able to reread before sending.
 */
function RejectForm({ busy, onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  return (
    <form
      className={styles.officeBox}
      onSubmit={(event) => {
        event.preventDefault();
        if (!tooShort) onSubmit(reason.trim());
      }}
    >
      <p className={styles.officeHead}>Reject invoice</p>

      <label className={styles.officeField}>
        <span className={styles.officeLabel}>
          What is wrong with it? The customer never sees this — whoever corrects
          the invoice does.
        </span>
        <textarea
          className={styles.officeInput}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Declared value does not match the booking form"
        />
      </label>

      <div className={styles.rowActions}>
        <button type="submit" className={styles.rowButton} disabled={tooShort || busy}>
          {busy ? 'Rejecting…' : 'Reject this invoice'}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Invoices() {
  const [params] = useSearchParams();

  const list = useCollection(
    listInvoices,
    // Opens on the queue. Anything else has to be asked for, which is what
    // makes this page a to-do list rather than an archive.
    { status: params.get('status') ?? 'pending_review' },
    params.get('search') ?? '',
  );

  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  /** The sentence to put in the banner for a failed call. */
  function fault(failure) {
    // A 400 from the upload validator already says exactly what is wrong with
    // the file — "that file is not a PDF" — and no wording here improves on
    // it. The server is the only thing that knows.
    const field = failure.fields?.pdf;
    if (field) return Array.isArray(field) ? field.join(' ') : String(field);

    // 409 is the state machine refusing, which is a different thing from the
    // request having failed: somebody moved this invoice between the page
    // loading and the button being pressed.
    if (failure.status === 409) {
      return 'Someone else has already moved this invoice. Reload to see where it stands.';
    }

    return 'That could not be saved. Check the connection and try again.';
  }

  async function run(invoice, call, success) {
    setBusyId(invoice.id);
    setError('');
    setDone('');

    try {
      list.replaceRow(await call());
      setRejectingId(null);
      setDone(success);
    } catch (failure) {
      setError(fault(failure));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Invoices</h1>
        <p className={styles.subtitle}>
          An invoice is raised automatically when a shipment is marked paid on
          the Packages page — and for a shipment that was already paid before
          that, with the “Raise invoice” button there. Uploading the PDF here
          approves it in your name and publishes it to the customer&apos;s own
          profile page in one step, so there is nothing separate to send.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search invoices"
          placeholder="Search by tracking number or customer"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={INVOICE_STATUSES}
          allLabel="Any status"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{done}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>
            {list.filters.status === 'pending_review' ? (
              <>
                Nothing is waiting for review.
                <br />
                {/* An empty queue has two very different causes, and the
                    same sentence for both is what makes this page look
                    broken: either everything is dealt with, or no invoice
                    has ever been raised and there is nothing here to
                    approve or upload a document to. The second is fixed on
                    the Packages page, so this says so. */}
                <span className={styles.mutedCell}>
                  If you are expecting one, check{' '}
                  <Link className={styles.link} to="/dashboard/invoices?status=all">
                    every status
                  </Link>{' '}
                  — and if there are no invoices at all, raise one from a paid
                  shipment on{' '}
                  <Link className={styles.link} to="/dashboard/packages">
                    Packages
                  </Link>
                  .
                </span>
              </>
            ) : (
              'No invoices match that.'
            )}
          </Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Shipment</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Value</th>
                  <th scope="col">Raised</th>
                  <th scope="col">Status</th>
                  <th scope="col">Review</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={
                      invoice.status === 'pending_review'
                        ? styles.rowUnhandled
                        : undefined
                    }
                  >
                    <td>
                      <div className={styles.primaryCell}>
                        {invoice.tracking_number}
                      </div>
                      <div className={styles.mutedCell}>Invoice #{invoice.id}</div>
                    </td>

                    <td>{invoice.customer}</td>

                    <td className={styles.numberCell}>
                      {formatMoney(invoice.value_eur)}
                    </td>

                    <td className={styles.dateCell}>
                      {formatDateTime(invoice.created_at)}
                    </td>

                    <td>
                      <StatusBadge tone={TONES[invoice.status]}>
                        {invoice.status_display}
                      </StatusBadge>

                      {/* Who decided, and why, shown where the decision is. */}
                      {invoice.reviewed_by_name && (
                        <div className={styles.mutedCell}>
                          {invoice.reviewed_by_name} ·{' '}
                          {formatDateTime(invoice.reviewed_at)}
                        </div>
                      )}
                      {invoice.rejection_reason && (
                        <div className={styles.mutedCell}>
                          {invoice.rejection_reason}
                        </div>
                      )}
                      {invoice.status === 'sent' && (
                        <div className={styles.mutedCell}>
                          On the customer&apos;s profile since{' '}
                          {formatDateTime(invoice.sent_at)}
                        </div>
                      )}
                      {/* Approved with nothing rendered is a stuck job rather
                          than a state anybody chose, so it is worth naming. */}
                      {invoice.status === 'approved' && !invoice.pdf_url && (
                        <div className={styles.mutedCell}>
                          Waiting for a document — upload one to send it.
                        </div>
                      )}
                    </td>

                    <td>
                      <div className={styles.rowActions}>
                        {invoice.status === 'pending_review' ? (
                          <>
                            <button
                              type="button"
                              className={styles.rowButton}
                              disabled={busyId === invoice.id}
                              onClick={() =>
                                run(
                                  invoice,
                                  () => approveInvoice(invoice.id),
                                  `Invoice for ${invoice.tracking_number} approved. It reaches the customer's profile once the document has rendered.`,
                                )
                              }
                            >
                              {busyId === invoice.id ? 'Working…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={busyId === invoice.id}
                              onClick={() =>
                                setRejectingId(
                                  rejectingId === invoice.id ? null : invoice.id,
                                )
                              }
                            >
                              {rejectingId === invoice.id ? 'Cancel' : 'Reject'}
                            </button>
                          </>
                        ) : null}

                        {ACCEPTS_DOCUMENT.includes(invoice.status) ? (
                          <UploadButton
                            invoice={invoice}
                            busy={busyId === invoice.id}
                            onPick={(file) =>
                              run(
                                invoice,
                                () => uploadInvoiceDocument(invoice.id, file),
                                invoice.status === 'sent'
                                  ? `Document replaced for ${invoice.tracking_number}. The customer was not notified again.`
                                  : invoice.status === 'pending_review'
                                    ? `Invoice for ${invoice.tracking_number} approved in your name and sent. It is on the customer's profile page now.`
                                    : `Invoice for ${invoice.tracking_number} sent. It is on the customer's profile page now.`,
                              )
                            }
                          />
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}

                        {/* Staff read the same document the customer gets.
                            Absolute, from the API, so it works from the Vite
                            dev server as well as from the built app. */}
                        {invoice.pdf_url && (
                          <a
                            className={styles.link}
                            href={invoice.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* Below the table rather than inside a cell: a textarea in a table row
          squeezes every other column. */}
      {rejectingId !== null &&
        list.rows
          .filter((invoice) => invoice.id === rejectingId)
          .map((invoice) => (
            <section key={invoice.id} className={styles.detail}>
              <h2 className={styles.detailTitle}>
                Invoice for {invoice.tracking_number}
              </h2>

              <RejectForm
                busy={busyId === invoice.id}
                onCancel={() => setRejectingId(null)}
                onSubmit={(reason) =>
                  run(
                    invoice,
                    () => rejectInvoice(invoice.id, reason),
                    `Invoice for ${invoice.tracking_number} rejected. It goes back for correction and stays hidden from the customer.`,
                  )
                }
              />
            </section>
          ))}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
