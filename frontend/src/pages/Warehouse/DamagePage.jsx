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
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { Message } from './opsUi';
import { useLoad } from './useLoad';
import { whoAndWhen } from './when';
import styles from './Ops.module.css';

const FILTERS = ['open', 'resolved'];

function Report({ report, onResolved }) {
  const { t } = useLanguage();
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
      setError(errorMessage(caught, t('dashboard.flow.damagePage.resolveError'), t));
      setBusy(false);
    }
  }

  const open = report.resolution_status === 'open';

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{t(`dashboard.flow.damage.types.${report.damage_type}`)}</h2>
        <span className={open ? styles.flag : styles.statusPill}>{t(`dashboard.flow.damagePage.${report.resolution_status}`)}</span>
      </div>

      <p className={styles.rowDetail}>
        <Link to={`/warehouse/packages/${report.package.id}`} className={styles.rowTitle}>
          {report.package.tracking_number}
        </Link>
        {report.package.customer && ` · ${report.package.customer}`}
        {' · '}
        {fill(t('dashboard.flow.damagePage.reportedBy'), { who: whoAndWhen(report) })}
      </p>

      {report.description && <p className={styles.eventDetail}>{report.description}</p>}

      {report.photos.length > 0 && (
        <div className={styles.photos}>
          {report.photos.map((photo, index) => (
            <a key={photo.id} href={apiUrl(photo.url)} target="_blank" rel="noreferrer">
              <img
                src={apiUrl(photo.url)}
                alt={fill(t('dashboard.flow.damage.photo'), { number: index + 1 })}
                className={styles.photo}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {!open && (
        <p className={styles.rowDetail}>
          {fill(t('dashboard.flow.damagePage.resolvedBy'), { name: report.resolved_by?.name ?? '' })}
          {report.resolution_note && `: ${report.resolution_note}`}
        </p>
      )}

      <Message tone="error">{error}</Message>

      {open &&
        (resolving ? (
          <form onSubmit={resolve} className={`${styles.fields} ${styles.alignEnd}`}>
            <label className={styles.field}>
              <span className={styles.label}>{t('dashboard.flow.damagePage.whatDone')}</span>
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
                {busy ? t('dashboard.flow.common.saving') : t('dashboard.flow.damagePage.markResolved')}
              </button>
              <button type="button" className={styles.secondary} onClick={() => setResolving(false)}>
                {t('dashboard.flow.common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => setResolving(true)}>
            {t('dashboard.flow.damagePage.resolve')}
          </button>
        ))}
    </article>
  );
}

export default function DamagePage() {
  const { t } = useLanguage();
  const [status, setStatus] = useState('open');
  const [flash, setFlash] = useState('');
  const { state, data, reload } = useLoad(() => listDamageReports({ status, page_size: 100 }), status);

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t('dashboard.flow.damagePage.title')}</h1>
          <p className={styles.pageLead}>{t('dashboard.flow.damagePage.lead')}</p>
        </div>
      </div>

      <div className={styles.filterBar} role="group" aria-label={t('dashboard.flow.damagePage.show')}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            className={`${styles.filterButton} ${status === value ? styles.filterOn : ''}`}
            onClick={() => {
              setStatus(value);
              setFlash('');
            }}
          >
            {t(`dashboard.flow.damagePage.${value}`)}
          </button>
        ))}
      </div>

      <Message tone="success">{flash}</Message>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={`${styles.card} ${styles.empty}`}>
            {status === 'open' ? t('dashboard.flow.damagePage.emptyOpen') : t('dashboard.flow.damagePage.emptyResolved')}
          </p>
        ) : (
          <div>
            {data.results.map((report) => (
              <Report
                key={report.id}
                report={report}
                onResolved={(resolved) => {
                  setFlash(
                    fill(t('dashboard.flow.damagePage.resolvedMessage'), {
                      type: t(`dashboard.flow.damage.types.${resolved.damage_type}`),
                      tracking: resolved.package.tracking_number,
                    }),
                  );
                  reload();
                }}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
