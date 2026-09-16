// src/pages/Warehouse/PackagingPage.jsx
//
// What is waiting to be packed, and the packaging recorded today.
//
// Packing normally starts at the scanner, but this page also records it on
// its own: Add packaging finds a package and opens the packaging form here.
// A packaging record cannot be changed once written - the server keeps them
// append-only - so a row recorded today offers Add more instead of an edit:
// the same package and material again, for what was missed or miscounted.

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWarehouseShipment } from '../../api/staff';
import { errorMessage, listPackaging } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import PackagePicker from './PackagePicker';
import PackageQueue from './PackageQueue';
import PackagingForm from './PackagingForm';
import { Message } from './opsUi';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

const P = 'dashboard.flow.packagingPage.';
const WAITING = ['measured', 'awaiting_packaging'];

/**
 * Add packaging in one card: pick a package, then the same form the package
 * workflow uses.
 *
 * @param {{ target: object|null, onPick: (row: object|null) => void, busy: boolean,
 *   error: string, onSaved: (answer: object) => void, onClose: () => void }} props
 *   target is `{ id, tracking_number, initial }`, or null while picking
 */
function PackagingPanel({ target, onPick, busy, error, onSaved, onClose }) {
  const { t } = useLanguage();

  return (
    <section className={`${styles.card} ${styles.gapBottom}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          {target
            ? fill(t(`${P}packingTitle`), { package: target.tracking_number })
            : t('dashboard.flow.picker.title')}
        </h2>
        {target && (
          <button type="button" className={styles.textButton} onClick={() => onPick(null)}>
            {t(`${P}changePackage`)}
          </button>
        )}
      </div>

      <Message tone="error">{error}</Message>

      {busy ? (
        <Loading inline />
      ) : target ? (
        <PackagingForm
          key={target.id}
          shipment={target}
          initial={target.initial}
          onSaved={onSaved}
          onCancel={onClose}
        />
      ) : (
        <PackagePicker stages={WAITING} onPick={onPick} onCancel={onClose} />
      )}
    </section>
  );
}

function PackagedToday({ reloadKey, onAddMore }) {
  const { t } = useLanguage();
  const { state, data, reload } = useLoad(
    () => listPackaging({ today: 'true', page_size: 200 }),
    `today#${reloadKey}`,
  );

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        {t(`${P}todayTitle`)}
        {data ? ` (${data.count})` : ''}
      </h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{t(`${P}todayEmpty`)}</p>
        ) : (
          <ul className={styles.rows}>
            {data.results.map((row) => (
              <li key={row.id}>
                <div className={styles.row}>
                  <Link to={`/warehouse/packages/${row.package.id}`} className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {row.quantity} × {t(`dashboard.flow.packaging.types.${row.packaging_type}`)}
                    </span>
                    <span className={styles.rowDetail}>
                      {row.package.tracking_number}
                      {row.notes && ` · ${row.notes}`}
                    </span>
                  </Link>
                  <span className={styles.rowSide}>
                    <span className={styles.eventTime}>{row.time}</span>
                    <span className={styles.rowDetail}>{row.worker?.name}</span>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => onAddMore(row)}
                    >
                      {t(`${P}addMore`)}
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export default function PackagingPage() {
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

  /** Add packaging with no row, or Add more with the row to build on. */
  function start(row) {
    setFlash('');
    setError('');
    setTarget(
      row
        ? {
            id: row.package.id,
            tracking_number: row.package.tracking_number,
            // The material and any note again, with the count back at one.
            initial: { packaging_type: row.packaging_type, notes: row.notes },
          }
        : null,
    );
    setOpen(true);
  }

  /** A package chosen in the picker, or null on the way back to it. */
  async function pick(row) {
    setError('');
    if (!row) {
      setTarget(null);
      return;
    }
    setBusy(true);
    try {
      const shipment = await getWarehouseShipment(row.id);
      setTarget({ id: shipment.id, tracking_number: shipment.tracking_number, initial: null });
    } catch (caught) {
      setError(errorMessage(caught, undefined, t));
    } finally {
      setBusy(false);
    }
  }

  function saved({ packaging, shipment }) {
    const name = shipment?.tracking_number ?? target?.tracking_number ?? '';
    close();
    setReloadKey((n) => n + 1);
    setFlash(
      fill(t(`${P}saved`), {
        package: name,
        quantity: packaging.quantity,
        type: t(`dashboard.flow.packaging.types.${packaging.packaging_type}`),
      }),
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t(`${P}title`)}</h1>
          <p className={styles.pageLead}>{t(`${P}lead`)}</p>
        </div>
        {!open && (
          <button type="button" className={styles.primary} onClick={() => start(null)}>
            {t(`${P}add`)}
          </button>
        )}
      </div>

      <Message tone="success">{flash}</Message>

      {open && (
        <PackagingPanel
          target={target}
          onPick={pick}
          busy={busy}
          error={error}
          onSaved={saved}
          onClose={close}
        />
      )}

      <PackageQueue
        title={t(`${P}waitingTitle`)}
        stages={WAITING}
        empty={t(`${P}waitingEmpty`)}
        reloadKey={reloadKey}
      />
      <PackageQueue
        title={t(`${P}packedTitle`)}
        stages={['packed']}
        empty={t(`${P}packedEmpty`)}
        reloadKey={reloadKey}
      />
      <PackagedToday reloadKey={reloadKey} onAddMore={start} />
    </div>
  );
}
