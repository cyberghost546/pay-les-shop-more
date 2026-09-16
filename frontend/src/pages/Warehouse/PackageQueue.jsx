// src/pages/Warehouse/PackageQueue.jsx
//
// The packages waiting for one step, oldest first - the order to work them
// in. Each row opens the package's workflow.

import { Link } from 'react-router-dom';
import { listWarehouseShipments } from '../../api/staff';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import StagePill from './StagePill';
import { useLoad } from './useLoad';
import { waitedFor } from './waited';
import styles from './Ops.module.css';

const PAGE_SIZE = 50;

/**
 * @param {{ title: string, stages: string[], empty: string, reloadKey?: string|number }} props
 *   reloadKey: change it to fetch the queue again, after work elsewhere on
 *   the page has moved a package out of it.
 */
export default function PackageQueue({ title, stages, empty, reloadKey = '' }) {
  const { t } = useLanguage();
  const stage = stages.join(',');
  const { state, data, reload } = useLoad(
    () => listWarehouseShipments({ stage, page_size: PAGE_SIZE }),
    `${stage}#${reloadKey}`,
  );

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          {title}
          {data ? ` (${data.count})` : ''}
        </h2>
        <Link to={`/warehouse/packages?stage=${stage}`} className={styles.backLink}>
          {t('dashboard.flow.common.seeAll')}
        </Link>
      </div>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{empty}</p>
        ) : (
          <ul className={styles.rows}>
            {data.results.map((row) => (
              <li key={row.id}>
                <Link to={`/warehouse/packages/${row.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{row.tracking_number}</span>
                    <span className={styles.rowDetail}>
                      {row.customer}
                      {row.warehouse_location && ` · ${row.warehouse_location}`}
                      {` · ${fill(t('dashboard.flow.queue.waiting'), { time: waitedFor(row.warehouse_stage_at) })}`}
                    </span>
                  </span>
                  <span className={styles.rowSide}>
                    <StagePill stage={row.warehouse_stage} label={t(`dashboard.flow.stages.${row.warehouse_stage}`)} />
                    {row.has_open_damage && <span className={styles.flag}>{t('dashboard.flow.queue.damage')}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
