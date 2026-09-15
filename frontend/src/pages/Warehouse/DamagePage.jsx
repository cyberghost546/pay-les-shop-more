// src/pages/Warehouse/DamagePage.jsx
//
// Damage reports: open ones first, with their photos, and a way to close
// each one once it has been dealt with.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../../api/client';
import { errorMessage, listDamageReports, resolveDamageReport } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { Message } from './opsUi';
import { useLoad } from './useLoad';
import { whoAndWhen } from './when';
import styles from './Ops.module.css';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

function Report({ report, onResolved }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function resolve(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onResolved(await resolveDamageReport(report.id, note.trim()));
    } catch (caught) {
      setError(errorMessage(caught, 'The report could not be resolved. Try again.'));
      setBusy(false);
    }
  }

  const open = report.resolution_status === 'open';

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{report.damage_type_display}</h2>
        <span className={open ? styles.flag : styles.statusPill}>{report.resolution_status_display}</span>
      </div>

      <p className={styles.rowDetail}>
        <Link to={`/warehouse/packages/${report.package.id}`} className={styles.rowTitle}>
          {report.package.tracking_number}
        </Link>
        {report.package.customer && ` · ${report.package.customer}`}
        {' · '}Reported by {whoAndWhen(report)}
      </p>

      {report.description && <p className={styles.eventDetail}>{report.description}</p>}

      {report.photos.length > 0 && (
        <div className={styles.photos}>
          {report.photos.map((photo, index) => (
            <a key={photo.id} href={apiUrl(photo.url)} target="_blank" rel="noreferrer">
              <img
                src={apiUrl(photo.url)}
                alt={`Damage photo ${index + 1}`}
                className={styles.photo}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {!open && (
        <p className={styles.rowDetail}>
          Resolved by {report.resolved_by?.name}
          {report.resolution_note && `: ${report.resolution_note}`}
        </p>
      )}

      <Message tone="error">{error}</Message>

      {open &&
        (resolving ? (
          <form onSubmit={resolve} className={`${styles.fields} ${styles.alignEnd}`}>
            <label className={styles.field}>
              <span className={styles.label}>What was done? (optional)</span>
              <input
                className={styles.input}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                autoFocus
              />
            </label>
            <div className={styles.buttonRow}>
              <button type="submit" className={styles.success} disabled={busy}>
                {busy ? 'Saving…' : 'Mark resolved'}
              </button>
              <button type="button" className={styles.secondary} onClick={() => setResolving(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => setResolving(true)}>
            Resolve
          </button>
        ))}
    </article>
  );
}

export default function DamagePage() {
  const [status, setStatus] = useState('open');
  const [flash, setFlash] = useState('');
  const { state, data, reload } = useLoad(() => listDamageReports({ status, page_size: 100 }), status);

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Damaged Packages</h1>
          <p className={styles.pageLead}>Report damage from a package&apos;s own page, after scanning it.</p>
        </div>
      </div>

      <div className={styles.filterBar} role="group" aria-label="Show">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            className={`${styles.filterButton} ${status === option.value ? styles.filterOn : ''}`}
            onClick={() => {
              setStatus(option.value);
              setFlash('');
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Message tone="success">{flash}</Message>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={`${styles.card} ${styles.empty}`}>
            {status === 'open' ? 'No open damage reports.' : 'No resolved damage reports yet.'}
          </p>
        ) : (
          <div>
            {data.results.map((report) => (
              <Report
                key={report.id}
                report={report}
                onResolved={(resolved) => {
                  setFlash(`${resolved.damage_type_display} on ${resolved.package.tracking_number} marked resolved.`);
                  reload();
                }}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
