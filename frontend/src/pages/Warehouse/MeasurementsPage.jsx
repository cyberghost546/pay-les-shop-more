// src/pages/Warehouse/MeasurementsPage.jsx
//
// What still needs the tape measure, and what was measured today.

import { Link } from 'react-router-dom';
import { listMeasurements } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import PackageQueue from './PackageQueue';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

function MeasuredToday() {
  const { state, data, reload } = useLoad(() => listMeasurements({ today: 'true', page_size: 200 }), 'today');

  return (
    <section className={styles.card} id="today">
      <h2 className={styles.cardTitle}>Measured today{data ? ` (${data.count})` : ''}</h2>
      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>Nothing measured yet today.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Package</th>
                  <th className={styles.num}>Weight</th>
                  <th className={styles.num}>L × W × H (cm)</th>
                  <th className={styles.num}>Volume</th>
                  <th className={styles.num}>Dim. weight</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row) => (
                  <tr key={row.id}>
                    <td>{row.time}</td>
                    <td>
                      <Link to={`/warehouse/packages/${row.package.id}`}>{row.package.tracking_number}</Link>
                      {!row.current && <div className={styles.rowDetail}>Replaced by a later measurement</div>}
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
  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Measurements</h1>
          <p className={styles.pageLead}>Tap a package to weigh and measure it.</p>
        </div>
      </div>
      <PackageQueue
        title="Waiting for measurement"
        stages={['received', 'awaiting_measurement']}
        empty="Nothing is waiting to be measured."
      />
      <MeasuredToday />
    </div>
  );
}
