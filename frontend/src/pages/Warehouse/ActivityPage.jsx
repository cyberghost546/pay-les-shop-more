// src/pages/Warehouse/ActivityPage.jsx
//
// Everything the warehouse has done, newest first. Read-only: activity
// records can never be edited, by anybody.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listActivity } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { useLoad } from './useLoad';
import { whoAndWhen } from './when';
import styles from './Ops.module.css';

const FILTERS = [
  { value: 'mine-today', label: 'My work today', params: { mine: 'true', today: 'true' } },
  { value: 'today', label: 'Everyone today', params: { today: 'true' } },
  { value: 'mine', label: 'All my work', params: { mine: 'true' } },
  { value: 'all', label: 'Everything', params: {} },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState('mine-today');
  const [page, setPage] = useState(1);
  const params = FILTERS.find((option) => option.value === filter).params;

  const { state, data, reload } = useLoad(
    () => listActivity({ ...params, page, page_size: 50 }),
    `${filter}:${page}`,
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Activity</h1>
          <p className={styles.pageLead}>Every warehouse action is recorded here and cannot be changed.</p>
        </div>
      </div>

      <div className={styles.filterBar} role="group" aria-label="Show">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            className={`${styles.filterButton} ${filter === option.value ? styles.filterOn : ''}`}
            onClick={() => {
              setFilter(option.value);
              setPage(1);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className={styles.card}>
        {state === 'loading' && <Loading inline />}
        {state === 'error' && <ConnectionError inline onRetry={reload} />}
        {state === 'ready' &&
          (data.results.length === 0 ? (
            <p className={styles.empty}>No activity here yet.</p>
          ) : (
            <ul className={styles.rows}>
              {data.results.map((entry) => (
                <li key={entry.id}>
                  <Link to={`/warehouse/packages/${entry.package.id}`} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{entry.action_display}</span>
                      <span className={styles.rowDetail}>
                        {entry.package.tracking_number} · {entry.description}
                      </span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.eventTime}>{entry.time}</span>
                      <span className={styles.rowDetail}>{whoAndWhen({ ...entry, time: '' }) || entry.date}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {state === 'ready' && (data.hasNext || data.hasPrevious) && (
          <div className={`${styles.buttonRow} ${styles.gapTop}`}>
            <button
              type="button"
              className={styles.secondary}
              disabled={!data.hasPrevious}
              onClick={() => setPage((n) => n - 1)}
            >
              Newer
            </button>
            <button
              type="button"
              className={styles.secondary}
              disabled={!data.hasNext}
              onClick={() => setPage((n) => n + 1)}
            >
              Older
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
