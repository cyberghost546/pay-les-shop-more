// src/pages/Warehouse/WarehouseHome.jsx
//
// The first screen on the floor: the scanner one tap away, then the whole
// workload as cards - one per stage, plus the three that need somebody now:
// problems, shipments waiting too long, and what came in today.
//
// A card is a number and a word, readable from across the room on a tablet
// on the wall. Tapping one opens the shipments behind it.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createIntakeSheet,
  getWarehouseBoard,
  getWarehouseSummary,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { Banner, Empty, StatusBadge } from '../Dashboard/ui';
import { formatDateTime, formatWeight } from '../Dashboard/format';
import dashboard from '../Dashboard/Dashboard.module.css';
import { waitedFor } from './waited';
import styles from './Warehouse.module.css';

// How often the board refreshes itself while it is open. Often enough that a
// wall screen keeps up with the floor, rarely enough to be no load at all.
const REFRESH_MS = 60_000;

function StageCard({ stage }) {
  return (
    <Link
      to={`/warehouse/shipments?stage=${stage.stage}`}
      className={`${styles.boardCard} ${styles[`boardCard_${stage.stage}`]}`}
    >
      <span className={styles.boardValue}>{stage.count}</span>
      <span className={styles.boardLabel}>{stage.label}</span>
      <span className={styles.boardSub}>
        {stage.overdue > 0 ? `${stage.overdue} waiting too long` : ' '}
      </span>
    </Link>
  );
}

function AlarmList({ title, rows, empty, link, detail }) {
  return (
    <section className={`${dashboard.card} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <Link to={link} className={dashboard.sectionLink}>
          See all
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className={styles.recent}>
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/warehouse/shipments/${row.id}`} className={styles.recentRow}>
                <span className={styles.recentMain}>
                  <span className={styles.recentLabel}>{row.tracking_number}</span>
                  <span className={styles.recentDetail}>
                    {row.customer} · {detail(row)}
                  </span>
                </span>
                <StatusBadge tone="neutral">{row.warehouse_stage_display}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function WarehouseHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ attempt: -1, status: 'loading', data: null });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([getWarehouseBoard(), getWarehouseSummary()])
      .then(([board, summary]) => {
        if (!cancelled) setAnswer({ attempt, status: 'ready', data: { board, summary } });
      })
      .catch(() => {
        // The last good numbers are kept, so a dropped refresh on a wall
        // screen shows a warning rather than an empty board.
        if (!cancelled) setAnswer((previous) => ({ attempt, status: 'error', data: previous.data }));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Quiet refresh: the previous numbers stay on screen while it runs.
  useEffect(() => {
    const timer = setInterval(() => setAttempt((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // Only the very first load shows a spinner; after that a refresh in flight
  // keeps the last answer rather than blanking the board every minute.
  const state = answer.data ? 'ready' : answer.attempt === attempt ? answer.status : 'loading';
  const failedRefresh = answer.data && answer.status === 'error';
  const board = answer.data?.board;
  const summary = answer.data?.summary;

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
          Scan a box to see the order and move it along. Tap a card to see the
          shipments behind it.
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
          {starting ? 'Starting…' : 'New intake sheet without scanning'}
        </button>
      </div>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}

      {state === 'ready' && board && (
        <>
          {failedRefresh && (
            <Banner tone="error">
              The board could not refresh. These numbers may be out of date.
            </Banner>
          )}

          {/* What needs somebody now, before the steady-state counts. */}
          <div className={styles.alarms}>
            <Link
              to="/warehouse/shipments?problem=true"
              className={`${styles.boardCard} ${board.problems > 0 ? styles.boardCardDanger : ''}`}
            >
              <span className={styles.boardValue}>{board.problems}</span>
              <span className={styles.boardLabel}>With a problem</span>
            </Link>
            <Link
              to="/warehouse/shipments?overdue=true"
              className={`${styles.boardCard} ${board.overdue > 0 ? styles.boardCardWarning : ''}`}
            >
              <span className={styles.boardValue}>{board.overdue}</span>
              <span className={styles.boardLabel}>Waiting too long</span>
            </Link>
            <div className={styles.boardCard}>
              <span className={styles.boardValue}>{board.today.packages}</span>
              <span className={styles.boardLabel}>Packages today</span>
            </div>
            <div className={styles.boardCard}>
              <span className={styles.boardValue}>{formatWeight(board.today.weight_kg)}</span>
              <span className={styles.boardLabel}>Weight today</span>
            </div>
          </div>

          <h2 className={styles.boardHeading}>Orders by stage</h2>
          <div className={styles.board}>
            {board.stages.map((stage) => (
              <StageCard key={stage.stage} stage={stage} />
            ))}
          </div>

          <div className={styles.profileColumns}>
            <AlarmList
              title="Problems"
              rows={board.problem_list}
              empty="No problems reported."
              link="/warehouse/shipments?problem=true"
              detail={(row) => row.problem_note}
            />
            <AlarmList
              title="Waiting too long"
              rows={board.overdue_list}
              empty="Nothing is waiting too long."
              link="/warehouse/shipments?overdue=true"
              detail={(row) => `${waitedFor(row.warehouse_stage_at)} in this stage`}
            />
          </div>

          <section className={`${dashboard.card} ${styles.section}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Intake sheets worked on recently</h2>
              <Link to="/warehouse/intake" className={dashboard.sectionLink}>
                All sheets ({summary.drafts} open)
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
