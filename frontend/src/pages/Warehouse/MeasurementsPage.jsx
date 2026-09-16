// src/pages/Warehouse/MeasurementsPage.jsx
//
// What still needs the tape measure, and what was measured today.
//
// Measuring normally starts at the scanner, but this page also does it on its
// own: Add measurement finds a package by tracking number and opens the
// measurement form here, and every row measured today can be corrected with
// Edit. A correction is saved the way the floor saves a first measurement -
// a new record that replaces the one before it.

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWarehouseShipment } from '../../api/staff';
import { errorMessage, listMeasurements } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import MeasurementForm from './MeasurementForm';
import { Message } from './opsUi';
import PackagePicker from './PackagePicker';
import PackageQueue from './PackageQueue';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

const M = 'dashboard.flow.measurementsPage.';
const WAITING = ['received', 'awaiting_measurement'];

/**
 * Add measurement and Edit in one card: pick a package, then the same form
 * the package workflow uses.
 *
 * @param {{ target: object|null, onPick: (row: object|null) => void, busy: boolean,
 *   error: string, onSaved: (answer: object) => void, onClose: () => void }} props
 *   target is `{ id, tracking_number, measurement }`, or null while picking
 */
function MeasurePanel({ target, onPick, busy, error, onSaved, onClose }) {
  const { t } = useLanguage();

  return (
    <section className={`${styles.card} ${styles.gapBottom}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          {target
            ? fill(t(`${M}measuringTitle`), { package: target.tracking_number })
            : t('dashboard.flow.picker.title')}
        </h2>
        {target && (
          <button type="button" className={styles.textButton} onClick={() => onPick(null)}>
            {t(`${M}changePackage`)}
          </button>
        )}
      </div>

      <Message tone="error">{error}</Message>

      {busy ? (
        <Loading inline />
      ) : target ? (
        <MeasurementForm
          key={target.id}
          shipment={target}
          initial={target.measurement}
          onSaved={onSaved}
          onCancel={onClose}
        />
      ) : (
        <PackagePicker stages={WAITING} onPick={onPick} onCancel={onClose} />
      )}
    </section>
  );
}

function MeasuredToday({ reloadKey, onEdit }) {
  const { t } = useLanguage();
  const { state, data, reload } = useLoad(
    () => listMeasurements({ today: 'true', page_size: 200 }),
    `today#${reloadKey}`,
  );

  return (
    <section className={styles.card} id="today">
      <h2 className={styles.cardTitle}>
        {t(`${M}todayTitle`)}
        {data ? ` (${data.count})` : ''}
      </h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{t(`${M}todayEmpty`)}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t(`${M}time`)}</th>
                  <th>{t(`${M}package`)}</th>
                  <th className={styles.num}>{t(`${M}weight`)}</th>
                  <th className={styles.num}>{t(`${M}dims`)}</th>
                  <th className={styles.num}>{t(`${M}volume`)}</th>
                  <th className={styles.num}>{t(`${M}dimensional`)}</th>
                  <th>{t(`${M}by`)}</th>
                  <th>{t(`${M}actions`)}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row) => (
                  <tr key={row.id}>
                    <td>{row.time}</td>
                    <td>
                      <Link to={`/warehouse/packages/${row.package.id}`}>
                        {row.package.tracking_number}
                      </Link>
                      {!row.current && (
                        <div className={styles.rowDetail}>{t(`${M}replaced`)}</div>
                      )}
                    </td>
                    <td className={styles.num}>{Number(row.weight_kg)} kg</td>
                    <td className={styles.num}>
                      {Number(row.length_cm)} × {Number(row.width_cm)} × {Number(row.height_cm)}
                    </td>
                    <td className={styles.num}>{Number(row.volume_m3)} m³</td>
                    <td className={styles.num}>{Number(row.dimensional_weight_kg)} kg</td>
                    <td>{row.worker?.name}</td>
                    <td>
                      <button type="button" className={styles.textButton} onClick={() => onEdit(row)}>
                        {t(`${M}edit`)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}

export default function MeasurementsPage() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setTarget(null);
    setError('');
  }, []);

  /** Add measurement with no row, or Edit with the row to correct. */
  function start(row) {
    setFlash('');
    setError('');
    setTarget(
      row
        ? {
            id: row.package.id,
            tracking_number: row.package.tracking_number,
            // The row is the measurement being corrected: its numbers start
            // in the boxes, and the form names it as the current one.
            measurement: row,
          }
        : null,
    );
    setOpen(true);
  }

  /**
   * A package chosen in the picker, or null on the way back to it. The list
   * row carries no measurement, so a box that was already measured is read
   * back in full - its numbers start in the boxes, as they do for Edit.
   */
  async function pick(row) {
    setError('');
    if (!row) {
      setTarget(null);
      return;
    }
    setBusy(true);
    try {
      const shipment = await getWarehouseShipment(row.id);
      setTarget({
        id: shipment.id,
        tracking_number: shipment.tracking_number,
        measurement: shipment.measurement ?? null,
      });
    } catch (caught) {
      setError(errorMessage(caught, undefined, t));
    } finally {
      setBusy(false);
    }
  }

  function saved({ measurement, shipment }) {
    const name = shipment?.tracking_number ?? target?.tracking_number ?? '';
    close();
    setReloadKey((n) => n + 1);
    setFlash(fill(t(`${M}saved`), { package: name, weight: Number(measurement.weight_kg) }));
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t(`${M}title`)}</h1>
          <p className={styles.pageLead}>{t(`${M}lead`)}</p>
        </div>
        {!open && (
          <button type="button" className={styles.primary} onClick={() => start(null)}>
            {t(`${M}add`)}
          </button>
        )}
      </div>

      <Message tone="success">{flash}</Message>

      {open && (
        <MeasurePanel
          target={target}
          onPick={pick}
          busy={busy}
          error={error}
          onSaved={saved}
          onClose={close}
        />
      )}

      <PackageQueue
        title={t(`${M}waitingTitle`)}
        stages={WAITING}
        empty={t(`${M}waitingEmpty`)}
        reloadKey={reloadKey}
      />
      <MeasuredToday reloadKey={reloadKey} onEdit={start} />
    </div>
  );
}
