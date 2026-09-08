// src/pages/Dashboard/Documents.jsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  DOCUMENT_KINDS,
  attachDocument,
  listDocuments,
  listPackages,
} from '../../api/staff';
import { formatBytes } from '../../components/FileDrop/formatBytes';
import { useCollection } from './useCollection';
import { formatDateTime } from './format';
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

const KIND_TONES = {
  receipt: 'progress',
  invoice: 'progress',
  customs: 'attention',
  other: 'neutral',
};

/**
 * The picker that files a loose document against a shipment.
 *
 * It offers only that customer's shipments. Staff *may* file a document
 * against anybody's — the server allows it, because a receipt occasionally
 * belongs to a parcel booked under a household member — but offering every
 * shipment in the business as a flat list would make the common case a
 * search through hundreds of options for one of two.
 */
function AttachPicker({ document: row, packages, busy, onAttach }) {
  const theirs = packages.filter((pkg) => pkg.customer?.id === row.customer);

  if (theirs.length === 0) {
    // "None found" rather than "none exists": the picker is fed by one page
    // of shipments, so a customer whose parcels fall outside it would be
    // described wrongly by the stronger claim.
    return (
      <span className={styles.mutedCell}>
        No shipment found for this customer
      </span>
    );
  }

  return (
    <select
      className={styles.rowSelect}
      aria-label={`File ${row.filename} against a shipment`}
      value={row.package ?? ''}
      disabled={busy}
      onChange={(event) =>
        onAttach(row, event.target.value ? Number(event.target.value) : null)
      }
    >
      <option value="">Not filed yet</option>
      {theirs.map((pkg) => (
        <option key={pkg.id} value={pkg.id}>
          {pkg.tracking_number}
          {pkg.description ? ` — ${pkg.description}` : ''}
        </option>
      ))}
    </select>
  );
}

export default function Documents() {
  const [params] = useSearchParams();

  const list = useCollection(
    listDocuments,
    {
      kind: params.get('kind') ?? '',
      unattached: params.get('unattached') ?? '',
    },
    params.get('search') ?? '',
  );

  // The shipments the filing picker offers. Fetched once rather than per row:
  // every picker draws from the same list, and one request beats one per
  // document on the page.
  const [packages, setPackages] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let cancelled = false;

    // The API's ceiling, because this feeds pickers rather than a table. A
    // shipment beyond it is reported as "not found" by the row rather than
    // silently offering the wrong ones — see AttachPicker.
    listPackages({ page_size: 200 })
      .then((page) => {
        if (!cancelled) setPackages(page.results);
      })
      .catch(() => {
        // Not fatal: the documents still list, the pickers just cannot offer
        // anything, which the row above reports on its own.
        if (!cancelled) setPackages([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function attach(row, packageId) {
    setBusyId(row.id);
    setError('');
    setDone('');

    try {
      const saved = await attachDocument(row.id, packageId);
      list.replaceRow(saved);
      setDone(
        packageId
          ? `Filed against ${saved.tracking_number}.`
          : 'Taken off that shipment.',
      );
    } catch {
      setError('That could not be saved. Check the connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Documents</h1>
        <p className={styles.subtitle}>
          What customers have sent in from their own profile page — the receipt
          for what they bought, the shop&apos;s invoice, a customs form. A
          document can arrive before the shipment does, so file it against one
          here when the parcel is booked.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search documents"
          placeholder="Search by customer, note, filename or tracking number"
        />
        <FilterSelect
          label="Kind"
          value={list.filters.kind}
          onChange={(value) => list.setFilter('kind', value)}
          options={DOCUMENT_KINDS}
          allLabel="Any kind"
        />
        <FilterSelect
          label="Filed"
          value={list.filters.unattached}
          onChange={(value) => list.setFilter('unattached', value)}
          options={[{ value: 'true', label: 'Not filed yet' }]}
          allLabel="All documents"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{done}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>
            {list.filters.unattached === 'true'
              ? 'Everything customers have sent in is filed against a shipment.'
              : 'No documents match that.'}
          </Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">What it is</th>
                  <th scope="col">File</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Shipment</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.id}
                    // A document nobody has filed is the one thing on this
                    // page that is work, so it is marked the way an unhandled
                    // message is.
                    className={row.package ? undefined : styles.rowUnhandled}
                  >
                    <td>
                      <div className={styles.primaryCell}>{row.customer_name}</div>
                      {row.uploaded_by_name !== row.customer_name && (
                        <div className={styles.mutedCell}>
                          Uploaded by {row.uploaded_by_name}
                        </div>
                      )}
                    </td>

                    <td>
                      <StatusBadge tone={KIND_TONES[row.kind]}>
                        {row.kind_display}
                      </StatusBadge>
                      {row.note && (
                        <div className={styles.mutedCell}>{row.note}</div>
                      )}
                    </td>

                    <td>
                      {/* Through the API view that checks the session, never
                          through /media: a receipt carries somebody's name,
                          address and what they paid. */}
                      <a
                        className={styles.link}
                        href={row.download_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.filename}
                      </a>
                      <div className={styles.mutedCell}>
                        {formatBytes(row.size_bytes)}
                      </div>
                    </td>

                    <td className={styles.dateCell}>
                      {formatDateTime(row.created_at)}
                    </td>

                    <td>
                      <AttachPicker
                        document={row}
                        packages={packages}
                        busy={busyId === row.id}
                        onAttach={attach}
                      />
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
