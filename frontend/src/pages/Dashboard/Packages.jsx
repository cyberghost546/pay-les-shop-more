// src/pages/Dashboard/Packages.jsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  PACKAGE_STATUSES,
  listPackages,
  raiseInvoice,
  updatePackage,
} from '../../api/staff';
import { useCollection } from './useCollection';
import { PACKAGE_TONES } from './statuses';
import { formatDate, formatDateTime, formatMoney, formatWeight } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  StatusSelect,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

// Statuses where nothing has left the warehouse yet, so the row is flagged as
// waiting on us. Matches the `awaiting_action` count on the overview.
const AWAITING = new Set(['quoted', 'paid']);

// Statuses from which an invoice can be raised — everything from paid
// onwards. A customer still holding a quote owes nothing, and a cancelled
// shipment is owed by nobody. The server refuses the rest; this only decides
// whether to draw the button.
const BILLABLE = new Set([
  'paid',
  'purchased',
  'in_transit',
  'arrived',
  'delivered',
]);

export default function Packages() {
  const [params] = useSearchParams();
  const list = useCollection(
    listPackages,
    { status: params.get('status') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  /**
   * Raise the invoice for a shipment that has none.
   *
   * Marking a package paid here raises one by itself, so this button only
   * appears on the rows that never went through that transition: seeded rows,
   * imports, anything set in the Django admin.
   */
  async function bill(pkg) {
    setSavingId(pkg.id);
    setError('');
    setDone('');

    try {
      const invoice = await raiseInvoice(pkg.id);
      // Patch the row in place rather than refetching the page, so the button
      // is replaced by the invoice's status without the table jumping.
      list.replaceRow({
        ...pkg,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          status_display: invoice.status_display,
        },
      });
      setDone(
        `Invoice raised for ${pkg.tracking_number}. It is in the review queue — open Invoices to upload the document.`,
      );
    } catch (failure) {
      setError(
        failure.fields?.detail ??
          'That invoice could not be raised. Check the connection and try again.',
      );
    } finally {
      setSavingId(null);
    }
  }

  async function changeStatus(pkg, status) {
    setSavingId(pkg.id);
    setError('');

    try {
      // The response carries shipped_at and delivered_at, which the server
      // stamps itself when the status says they happened — so the dates in
      // the table update without a refetch.
      list.replaceRow(await updatePackage(pkg.id, { status }));
    } catch {
      setError('That change could not be saved. Check the connection and try again.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Packages</h1>
        <p className={styles.subtitle}>
          Every customer&apos;s shipments. Moving one to “In transit” or
          “Delivered” stamps the date automatically. New packages are created
          in the Django admin.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search packages"
          placeholder="Search by tracking number, description or customer"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={PACKAGE_STATUSES}
          allLabel="Any status"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{done}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No packages match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Tracking</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Weight / value</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((pkg) => (
                  <tr
                    key={pkg.id}
                    className={AWAITING.has(pkg.status) ? styles.rowUnhandled : undefined}
                  >
                    <td>
                      <div className={styles.primaryCell}>{pkg.tracking_number}</div>
                      {pkg.description && (
                        <div className={`${styles.mutedCell} ${styles.excerpt}`}>
                          {pkg.description}
                        </div>
                      )}

                      {/* What the customer has sent in about this shipment —
                          the receipt for what they bought, the shop's
                          invoice, a customs form. Nested on the row by the
                          API, so this costs no extra request.

                          Each link goes through the API view that checks the
                          session, never through /media: a receipt carries
                          somebody's name, address and what they paid. */}
                      {pkg.documents?.length > 0 && (
                        <ul className={styles.attachments}>
                          {pkg.documents.map((document) => (
                            <li key={document.id}>
                              <a
                                className={styles.link}
                                href={document.download_url}
                                target="_blank"
                                rel="noreferrer"
                                title={document.note || document.filename}
                              >
                                {document.kind_display}
                              </a>
                              {document.note && (
                                <span className={styles.mutedCell}>
                                  {' '}
                                  · {document.note}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td>
                      <div>{pkg.customer?.name}</div>
                      <div className={styles.mutedCell}>
                        <a className={styles.link} href={`mailto:${pkg.customer?.email}`}>
                          {pkg.customer?.email}
                        </a>
                      </div>
                      {pkg.customer?.phone_number && (
                        <div className={styles.mutedCell}>
                          {pkg.customer.phone_number}
                        </div>
                      )}
                    </td>

                    <td className={styles.mutedCell}>
                      {/* The frozen snapshot taken when the package shipped,
                          not the customer's current address — which is the
                          whole point of storing it. */}
                      {pkg.delivery_address_text ? (
                        <span style={{ whiteSpace: 'pre-line' }}>
                          {pkg.delivery_address_text}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className={styles.numberCell}>
                      <div>{formatWeight(pkg.weight_kg)}</div>
                      <div className={styles.mutedCell}>{formatMoney(pkg.value_eur)}</div>
                    </td>

                    <td className={styles.dateCell}>
                      <div>Added {formatDate(pkg.created_at)}</div>
                      {pkg.shipped_at && <div>Shipped {formatDate(pkg.shipped_at)}</div>}
                      {pkg.delivered_at && (
                        <div>Delivered {formatDateTime(pkg.delivered_at)}</div>
                      )}
                    </td>

                    <td>
                      <StatusSelect
                        label={`Status for ${pkg.tracking_number}`}
                        value={pkg.status}
                        options={PACKAGE_STATUSES}
                        busy={savingId === pkg.id}
                        onChange={(value) => changeStatus(pkg, value)}
                      />
                      {/* Seven statuses is too many to tell apart at a glance
                          in a dropdown, so the badge carries the shape of it:
                          waiting, moving, done, closed. */}
                      <div style={{ marginTop: '0.35rem' }}>
                        <StatusBadge tone={PACKAGE_TONES[pkg.status]}>
                          {pkg.status_display}
                        </StatusBadge>
                      </div>

                      {/* Where the invoice for this shipment stands, and the
                          way to start one when there is none. Without this a
                          package that arrived already paid — seeded, imported,
                          set in the admin — has no invoice and nowhere to
                          make one, because every other invoice control lives
                          on a queue that would be empty. */}
                      {pkg.invoice ? (
                        <div className={styles.mutedCell}>
                          Invoice{' '}
                          <Link className={styles.link} to="/dashboard/invoices?status=all">
                            {pkg.invoice.status_display.toLowerCase()}
                          </Link>
                        </div>
                      ) : (
                        BILLABLE.has(pkg.status) && (
                          <button
                            type="button"
                            className={styles.rowButton}
                            style={{ marginTop: '0.35rem' }}
                            disabled={savingId === pkg.id}
                            onClick={() => bill(pkg)}
                          >
                            {savingId === pkg.id ? 'Working…' : 'Raise invoice'}
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
