// src/pages/Dashboard/Packages.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { PACKAGE_STATUSES, listPackages, updatePackage } from '../../api/staff';
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

export default function Packages() {
  const [params] = useSearchParams();
  const list = useCollection(
    listPackages,
    { status: params.get('status') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

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
