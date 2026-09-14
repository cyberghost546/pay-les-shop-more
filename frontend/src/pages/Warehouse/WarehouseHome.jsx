// src/pages/Warehouse/WarehouseHome.jsx
//
// The first screen on the floor: the scanner one tap away, four numbers that
// say how the day is going, and the sheets somebody touched last.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createIntakeSheet, getWarehouseSummary } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { Banner, Empty, StatusBadge } from '../Dashboard/ui';
import { formatDateTime } from '../Dashboard/format';
import dashboard from '../Dashboard/Dashboard.module.css';
import styles from './Warehouse.module.css';

export default function WarehouseHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ attempt: -1, status: 'loading', data: null });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getWarehouseSummary()
      .then((data) => {
        if (!cancelled) setAnswer({ attempt, status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ attempt, status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state = answer.attempt === attempt ? answer.status : 'loading';
  const summary = answer.data;

  async function startSheet() {
    setStarting(true);
    setError('');

    try {
      const sheet = await createIntakeSheet();
      navigate(`/warehouse/intake?sheet=${sheet.id}`);
    } catch {
      setError('A new sheet could not be started. Check the connection and try again.');
      setStarting(false);
    }
  }

  const firstName = user?.firstName || user?.name?.trim().split(' ')[0];

  return (
    <>
      <header className={dashboard.head}>
        <h1 className={dashboard.title}>
          {firstName ? `Hello, ${firstName}` : 'Warehouse'}
        </h1>
        <p className={dashboard.subtitle}>
          Scan a box to find its sheet or start one. Drafts stay yours until
          you release them to the office.
        </p>
      </header>

      <Banner tone="error">{error}</Banner>

      <div className={styles.actions}>
        <Link to="/warehouse/scan" className={dashboard.scanStart}>
          Scan a package
        </Link>
        <button
          type="button"
          className={dashboard.scanSecondary}
          onClick={startSheet}
          disabled={starting}
        >
          {starting ? 'Starting…' : 'New sheet without scanning'}
        </button>
      </div>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}

      {state === 'ready' && summary && (
        <>
          <div className={styles.stats}>
            <Link to="/warehouse/intake?status=draft" className={styles.stat}>
              <span className={styles.statValue}>{summary.drafts}</span>
              <span className={styles.statLabel}>Open drafts</span>
            </Link>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.my_drafts}</span>
              <span className={styles.statLabel}>Your drafts</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.started_today}</span>
              <span className={styles.statLabel}>Started today</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.released_today}</span>
              <span className={styles.statLabel}>Released today</span>
            </div>
          </div>

          <section className={dashboard.card}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Recently worked on</h2>
              <Link to="/warehouse/intake" className={dashboard.sectionLink}>
                All sheets
              </Link>
            </div>

            {summary.recent.length === 0 ? (
              <Empty>No intake sheets yet. Scan a box to start the first one.</Empty>
            ) : (
              <ul className={styles.recent}>
                {summary.recent.map((sheet) => (
                  <li key={sheet.id}>
                    <Link
                      to={`/warehouse/intake?sheet=${sheet.id}`}
                      className={styles.recentRow}
                    >
                      <span className={styles.recentMain}>
                        <span className={styles.recentLabel}>{sheet.label}</span>
                        <span className={styles.recentDetail}>
                          {sheet.destination || 'No destination yet'} ·{' '}
                          {formatDateTime(sheet.updated_at)}
                        </span>
                      </span>
                      <StatusBadge tone={sheet.status === 'draft' ? 'attention' : 'done'}>
                        {sheet.status_display}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
