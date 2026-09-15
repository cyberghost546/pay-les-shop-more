// src/pages/Dashboard/PackageHistory.jsx
//
// A package's warehouse history, opened under its row on the office Packages
// page: every warehouse action and status change, oldest first, and any damage
// reports with their photos. The same rows the warehouse wrote - the office
// reads them without leaving its own dashboard.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../../api/client';
import { getPackageTimeline, listPackageDamage } from '../../api/warehouse';
import { StatusBadge } from './ui';
import styles from './Dashboard.module.css';

/** @param {{ packageId: number }} props */
export default function PackageHistory({ packageId }) {
  const [answer, setAnswer] = useState({ status: 'loading', timeline: [], damage: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPackageTimeline(packageId), listPackageDamage(packageId)])
      .then(([timeline, damage]) => {
        if (!cancelled) setAnswer({ status: 'ready', timeline, damage });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ status: 'error', timeline: [], damage: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  if (answer.status === 'loading') return <p className={styles.mutedCell}>Loading history…</p>;
  if (answer.status === 'error') {
    return <p className={styles.mutedCell}>The history could not be loaded. Try again in a moment.</p>;
  }

  const { timeline, damage } = answer;

  return (
    <div className={styles.history}>
      <section>
        <h3 className={styles.historyTitle}>Warehouse history</h3>
        {timeline.length === 0 ? (
          <p className={styles.mutedCell}>Nothing has happened to this package in the warehouse yet.</p>
        ) : (
          <ol className={styles.historyList}>
            {timeline.map((entry) => (
              <li
                key={entry.id}
                className={`${styles.historyItem} ${entry.source === 'office' ? styles.historyItemOffice : ''}`}
              >
                <span className={styles.historyWhen}>
                  {entry.date} {entry.time}
                </span>
                <span className={styles.historyWhat}>
                  <strong>{entry.action_display}</strong>
                  {entry.description && <span className={styles.mutedCell}> · {entry.description}</span>}
                </span>
                <span className={styles.historyWho}>{entry.user?.name ?? '—'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {damage.length > 0 && (
        <section>
          <h3 className={styles.historyTitle}>Damage reports</h3>
          <ul className={styles.historyList}>
            {damage.map((report) => (
              <li key={report.id} className={styles.historyDamage}>
                <div>
                  <StatusBadge tone={report.resolution_status === 'open' ? 'attention' : 'done'}>
                    {report.resolution_status_display}
                  </StatusBadge>{' '}
                  <strong>{report.damage_type_display}</strong>
                  <span className={styles.mutedCell}>
                    {' '}
                    · {report.worker?.name} · {report.date} {report.time}
                  </span>
                </div>
                {report.description && <p className={styles.historyNote}>{report.description}</p>}
                {report.photos.length > 0 && (
                  <div className={styles.historyPhotos}>
                    {report.photos.map((photo, index) => (
                      <a key={photo.id} href={apiUrl(photo.url)} target="_blank" rel="noreferrer">
                        <img src={apiUrl(photo.url)} alt={`Damage photo ${index + 1}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.historyFoot}>
        <Link className={styles.link} to={`/warehouse/packages/${packageId}`}>
          Open in the warehouse dashboard →
        </Link>
      </p>
    </div>
  );
}
