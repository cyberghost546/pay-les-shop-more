// src/pages/Warehouse/PackagingPage.jsx
//
// What is waiting to be packed, and the packaging recorded today.

import { Link } from 'react-router-dom';
import { listPackaging } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { useLanguage } from '../../i18n/useLanguage';
import PackageQueue from './PackageQueue';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

function PackagedToday() {
  const { t } = useLanguage();
  const { state, data, reload } = useLoad(() => listPackaging({ today: 'true', page_size: 200 }), 'today');

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('dashboard.flow.packagingPage.todayTitle')}{data ? ` (${data.count})` : ''}</h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.flow.packagingPage.todayEmpty')}</p>
        ) : (
          <ul className={styles.rows}>
            {data.results.map((row) => (
              <li key={row.id}>
                <Link to={`/warehouse/packages/${row.package.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {row.quantity} × {t(`dashboard.flow.packaging.types.${row.packaging_type}`)}
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
  const { t } = useLanguage();
  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t('dashboard.flow.packagingPage.title')}</h1>
          <p className={styles.pageLead}>{t('dashboard.flow.packagingPage.lead')}</p>
        </div>
      </div>
      <PackageQueue
        title={t('dashboard.flow.packagingPage.waitingTitle')}
        stages={['measured', 'awaiting_packaging']}
        empty={t('dashboard.flow.packagingPage.waitingEmpty')}
      />
      <PackageQueue
        title={t('dashboard.flow.packagingPage.packedTitle')}
        stages={['packed']}
        empty={t('dashboard.flow.packagingPage.packedEmpty')}
      />
      <PackagedToday />
    </div>
  );
}
