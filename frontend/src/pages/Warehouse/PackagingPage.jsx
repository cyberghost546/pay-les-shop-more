// src/pages/Warehouse/PackagingPage.jsx
//
// What is waiting to be packed, and the packaging recorded today.

import { Link } from 'react-router-dom';
import { listPackaging } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import PackageQueue from './PackageQueue';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

function PackagedToday() {
  const { state, data, reload } = useLoad(() => listPackaging({ today: 'true', page_size: 200 }), 'today');

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Packaging recorded today{data ? ` (${data.count})` : ''}</h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>No packaging recorded yet today.</p>
        ) : (
          <ul className={styles.rows}>
            {data.results.map((row) => (
              <li key={row.id}>
                <Link to={`/warehouse/packages/${row.package.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {row.quantity} × {row.packaging_type_display}
                    </span>
                    <span className={styles.rowDetail}>
                      {row.package.tracking_number}
                      {row.notes && ` · ${row.notes}`}
                    </span>
                  </span>
                  <span className={styles.rowSide}>
                    <span className={styles.eventTime}>{row.time}</span>
                    <span className={styles.rowDetail}>{row.worker?.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export default function PackagingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Packaging</h1>
          <p className={styles.pageLead}>Tap a package to add packaging and mark it packaged.</p>
        </div>
      </div>
      <PackageQueue
        title="Waiting for packaging"
        stages={['measured', 'awaiting_packaging']}
        empty="Nothing is waiting to be packed."
      />
      <PackageQueue
        title="Packaged, not yet ready"
        stages={['packed']}
        empty="Nothing is sitting packaged."
      />
      <PackagedToday />
    </div>
  );
}
