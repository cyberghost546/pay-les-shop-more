// src/pages/Warehouse/WarehouseHome.jsx
//
// The warehouse dashboard: one enormous Scan Package button, six numbers a
// worker can read from across the floor, and the packages that need somebody
// now. Nothing from the office - no money, no customers list, no invoices.
//
// Refreshes itself every minute so a wall-mounted tablet keeps up.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWarehouseBoard, listWarehouseShipments } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { ScanIcon } from './icons';
import { Message } from './opsUi';
import StagePill from './StagePill';
import styles from './Ops.module.css';

const REFRESH_MS = 60_000;

function Tile({ to, value, label, hint, tone, alert }) {
  return (
    <Link to={to} className={`${styles.tile} ${tone} ${alert && value > 0 ? styles.tileAlert : ''}`}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {hint && <span className={styles.tileHint}>{hint}</span>}
    </Link>
  );
}

function reasonFor(row) {
  if (row.has_open_damage) return 'Damage reported';
  if (row.has_problem) return `Problem: ${row.problem_note}`;
  if (row.overdue) return 'Waiting too long in this step';
  return '';
}

export default function WarehouseHome() {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    Promise.all([getWarehouseBoard(), listWarehouseShipments({ attention: 'true', page_size: 6 })])
      .then(([board, attention]) => {
        if (!cancelled) setAnswer({ status: 'ready', data: { board, attention } });
      })
      .catch(() => {
        // Keep the last good numbers on a failed refresh.
        if (!cancelled) setAnswer((previous) => ({ status: 'error', data: previous.data }));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const timer = setInterval(() => setAttempt((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const { board, attention } = answer.data ?? {};
  const firstName = user?.firstName || user?.name?.trim().split(' ')[0];

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{firstName ? `Hello, ${firstName}` : 'Warehouse'}</h1>
          <p className={styles.pageLead}>
            {board ? `You have logged ${board.activity_today} action${board.activity_today === 1 ? '' : 's'} today.` : ' '}
          </p>
        </div>
      </div>

      <Link to="/warehouse/scan" className={styles.scanHero}>
        <ScanIcon />
        Scan Package
      </Link>

      {!answer.data && answer.status === 'loading' && <Loading inline />}
      {!answer.data && answer.status === 'error' && <ConnectionError inline onRetry={reload} />}
      {answer.data && answer.status === 'error' && (
        <Message tone="error">The numbers could not refresh. They may be out of date.</Message>
      )}

      {board && (
        <>
          <div className={styles.tiles}>
            <Tile
              to="/warehouse/measurements"
              value={board.waiting_measurement}
              label="Waiting for measurement"
              tone={styles.tonePurple}
            />
            <Tile
              to="/warehouse/measurements#today"
              value={board.measured_today}
              label="Measured today"
              tone={styles.toneBlue}
            />
            <Tile
              to="/warehouse/packaging"
              value={board.waiting_packaging}
              label="Waiting for packaging"
              tone={styles.toneOrange}
            />
            <Tile
              to="/warehouse/packages?stage=ready"
              value={board.ready_for_shipment}
              label="Ready for shipment"
              tone={styles.toneGreen}
            />
            <Tile
              to="/warehouse/damage"
              value={board.damaged}
              label="Damaged packages"
              tone={styles.toneRed}
              alert
            />
            <Tile
              to="/warehouse/packages?attention=true"
              value={board.attention}
              label="Requiring attention"
              hint="Damage, problems, or waiting too long"
              tone={styles.toneAmber}
              alert
            />
          </div>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Requiring attention</h2>
              <Link to="/warehouse/packages?attention=true" className={styles.backLink}>
                See all
              </Link>
            </div>
            {attention.results.length === 0 ? (
              <p className={styles.empty}>Nothing needs attention right now.</p>
            ) : (
              <ul className={styles.rows}>
                {attention.results.map((row) => (
                  <li key={row.id}>
                    <Link to={`/warehouse/packages/${row.id}`} className={styles.row}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{row.tracking_number}</span>
                        <span className={styles.rowDetail}>
                          {row.customer}
                          {row.warehouse_location && ` · ${row.warehouse_location}`}
                        </span>
                        <span className={styles.fieldError}>{reasonFor(row)}</span>
                      </span>
                      <span className={styles.rowSide}>
                        <StagePill stage={row.warehouse_stage} label={row.warehouse_stage_display} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
