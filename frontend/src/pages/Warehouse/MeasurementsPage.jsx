// src/pages/Warehouse/MeasurementsPage.jsx
//
// What still needs the tape measure, and what was measured today.

import { Link } from 'react-router-dom';
import { listMeasurements } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { useLanguage } from '../../i18n/useLanguage';
import PackageQueue from './PackageQueue';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

function MeasuredToday() {
  const { t } = useLanguage();
  const { state, data, reload } = useLoad(() => listMeasurements({ today: 'true', page_size: 200 }), 'today');

  return (
    <section className={styles.card} id="today">
      <h2 className={styles.cardTitle}>{t('dashboard.flow.measurementsPage.todayTitle')}{data ? ` (${data.count})` : ''}</h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.flow.measurementsPage.todayEmpty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('dashboard.flow.measurementsPage.time')}</th>
                  <th>{t('dashboard.flow.measurementsPage.package')}</th>
                  <th className={styles.num}>{t('dashboard.flow.measurementsPage.weight')}</th>
                  <th className={styles.num}>{t('dashboard.flow.measurementsPage.dims')}</th>
                  <th className={styles.num}>{t('dashboard.flow.measurementsPage.volume')}</th>
                  <th className={styles.num}>{t('dashboard.flow.measurementsPage.dimensional')}</th>
                  <th>{t('dashboard.flow.measurementsPage.by')}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row) => (
                  <tr key={row.id}>
                    <td>{row.time}</td>
                    <td>
                      <Link to={`/warehouse/packages/${row.package.id}`}>{row.package.tracking_number}</Link>
                      {!row.current && <div className={styles.rowDetail}>{t('dashboard.flow.measurementsPage.replaced')}</div>}
                    </td>
                    <td className={styles.num}>{Number(row.weight_kg)} kg</td>
                    <td className={styles.num}>
                      {Number(row.length_cm)} × {Number(row.width_cm)} × {Number(row.height_cm)}
                    </td>
                    <td className={styles.num}>{Number(row.volume_m3)} m³</td>
                    <td className={styles.num}>{Number(row.dimensional_weight_kg)} kg</td>
                    <td>{row.worker?.name}</td>
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
  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t('dashboard.flow.measurementsPage.title')}</h1>
          <p className={styles.pageLead}>{t('dashboard.flow.measurementsPage.lead')}</p>
        </div>
      </div>
      <PackageQueue
        title={t('dashboard.flow.measurementsPage.waitingTitle')}
        stages={['received', 'awaiting_measurement']}
        empty={t('dashboard.flow.measurementsPage.waitingEmpty')}
      />
      <MeasuredToday />
    </div>
  );
}
