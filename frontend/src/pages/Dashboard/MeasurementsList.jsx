// src/pages/Dashboard/MeasurementsList.jsx
//
// What the warehouse measured, for the office: every intake sheet with lines
// on it, its lines, and what they add up to. Read-only - the lines are edited
// on the sheet itself, and each row links there.

import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  INTAKE_FREIGHT,
  INTAKE_PACKAGING,
  INTAKE_STATUSES,
  listIntakeSheets,
} from '../../api/staff';
import { labelFor } from './statuses';
import { useCollection } from './useCollection';
import { formatDate } from './format';
import {
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

// Module scope, so useCollection sees the same function on every render.
const listMeasuredSheets = (filters) =>
  listIntakeSheets({ ...filters, measured: 'true' });

function number(value, digits) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "10 × Doos · 60 × 40 × 40 cm · 12 kg each" */
function describeLine(line) {
  const size = [line.length_cm, line.width_cm, line.height_cm]
    .map((value) => number(value, 1))
    .join(' × ');
  const kind = line.packaging ? ` ${labelFor(INTAKE_PACKAGING, line.packaging)}` : '';
  const weight = line.weight_kg === null ? '— kg' : `${number(line.weight_kg, 2)} kg each`;

  return `${line.quantity} ×${kind} · ${size} cm · ${weight}`;
}

export default function MeasurementsList() {
  const [params] = useSearchParams();

  const list = useCollection(
    listMeasuredSheets,
    {
      status: params.get('status') ?? '',
      freight: params.get('freight') ?? '',
    },
    params.get('search') ?? '',
  );

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Measurements</h1>
        <p className={styles.subtitle}>
          What the warehouse measured and weighed on each intake sheet. Totals
          count complete lines only; a line still missing a size or weight is
          shown but left out. Open a sheet to change its lines.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search measurements"
          placeholder="Search by reference, supplier, sender or destination"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={INTAKE_STATUSES}
          allLabel="Any status"
        />
        <FilterSelect
          label="Freight"
          value={list.filters.freight}
          onChange={(value) => list.setFilter('freight', value)}
          options={INTAKE_FREIGHT}
          allLabel="Sea and air"
        />
      </Toolbar>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No measured intake sheets match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Sheet</th>
                  <th scope="col">Lines</th>
                  <th scope="col">Colli</th>
                  <th scope="col">m³</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Chargeable</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((sheet) => {
                  const { totals } = sheet;

                  return (
                    <tr key={sheet.id}>
                      <td>
                        <Link
                          className={styles.link}
                          to={`/warehouse/intake?sheet=${sheet.id}`}
                        >
                          {sheet.label}
                        </Link>
                        <div>
                          <StatusBadge tone={sheet.released ? 'done' : 'attention'}>
                            {sheet.status_display}
                          </StatusBadge>
                        </div>
                        <div className={styles.mutedCell}>
                          {[sheet.supplier || sheet.sender, sheet.destination]
                            .filter(Boolean)
                            .join(' → ') || 'No consignment details'}
                        </div>
                        <div className={styles.mutedCell}>
                          {sheet.freight_display || 'Freight not set'} ·{' '}
                          {formatDate(sheet.received_on)}
                        </div>
                      </td>

                      <td>
                        {sheet.measurements.map((line) => (
                          <div
                            key={line.id}
                            className={line.complete ? undefined : styles.mutedCell}
                          >
                            {describeLine(line)}
                            {!line.complete && ' (incomplete)'}
                            {line.note && (
                              <div className={styles.mutedCell}>{line.note}</div>
                            )}
                          </div>
                        ))}
                      </td>

                      <td className={styles.numberCell}>{totals.colli ?? '—'}</td>
                      <td className={styles.numberCell}>{number(totals.volume_m3, 3)}</td>
                      <td className={styles.numberCell}>
                        {number(totals.weight_kg, 1)} kg
                        {sheet.declared_weight_kg !== null && (
                          <div className={styles.mutedCell}>
                            Declared {number(sheet.declared_weight_kg, 1)} kg
                          </div>
                        )}
                      </td>
                      <td className={styles.numberCell}>
                        {/* Only air freight is billed on volumetric weight. */}
                        {sheet.freight === 'air'
                          ? `${number(totals.chargeable_weight_kg, 1)} kg`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
