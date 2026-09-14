// src/pages/Warehouse/ShipmentList.jsx
//
// The shipments behind a card on the board: one stage, the problems, or
// everything waiting too long. The oldest first, because that is the order
// the work should be done in.

import { Link, useSearchParams } from 'react-router-dom';
import { WAREHOUSE_STAGES, listWarehouseShipments } from '../../api/staff';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { Empty, FilterSelect, Pagination, SearchInput, StatusBadge, Toolbar } from '../Dashboard/ui';
import { useCollection } from '../Dashboard/useCollection';
import { formatWeight } from '../Dashboard/format';
import dashboard from '../Dashboard/Dashboard.module.css';
import StagePill from './StagePill';
import { waitedFor } from './waited';
import styles from './Warehouse.module.css';

const SHOW = [
  { value: 'problem', label: 'With a problem' },
  { value: 'overdue', label: 'Waiting too long' },
];

// Module scope, so useCollection sees one stable function. The page's single
// "show" choice becomes the API's two separate flags here.
const fetchShipments = ({ show, ...filters }) =>
  listWarehouseShipments({
    ...filters,
    problem: show === 'problem' ? 'true' : '',
    overdue: show === 'overdue' ? 'true' : '',
  });

function titleFor(filters) {
  if (filters.show === 'problem') return 'Shipments with a problem';
  if (filters.show === 'overdue') return 'Waiting too long';
  const stage = WAREHOUSE_STAGES.find((option) => option.value === filters.stage);
  return stage ? stage.label : 'All shipments';
}

export default function ShipmentList() {
  const [params] = useSearchParams();

  const list = useCollection(
    fetchShipments,
    {
      stage: params.get('stage') ?? '',
      show: params.get('problem') === 'true' ? 'problem' : params.get('overdue') === 'true' ? 'overdue' : '',
    },
    params.get('search') ?? '',
  );

  return (
    <>
      <p>
        <Link to="/warehouse" className={dashboard.sectionLink}>
          ← Warehouse board
        </Link>
      </p>

      <header className={dashboard.head}>
        <h1 className={dashboard.title}>{titleFor(list.filters)}</h1>
        <p className={dashboard.subtitle}>Oldest first. Tap a shipment to see it and move it along.</p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search shipments"
          placeholder="Order number, customer or product"
        />
        <FilterSelect
          label="Stage"
          value={list.filters.stage}
          onChange={(value) => list.setFilter('stage', value)}
          options={WAREHOUSE_STAGES}
          allLabel="Every stage"
        />
        <FilterSelect
          label="Show"
          value={list.filters.show}
          onChange={(value) => list.setFilter('show', value)}
          options={SHOW}
          allLabel="Everything"
        />
      </Toolbar>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>Nothing here. Good work.</Empty>
        ) : (
          <ul className={`${dashboard.card} ${styles.recent}`}>
            {list.rows.map((row) => (
              <li key={row.id}>
                <Link to={`/warehouse/shipments/${row.id}`} className={styles.recentRow}>
                  <span className={styles.recentMain}>
                    <span className={styles.recentLabel}>{row.tracking_number}</span>
                    <span className={styles.recentDetail}>
                      {row.customer} · {row.destination || 'No destination'}
                      {row.weight_kg ? ` · ${formatWeight(row.weight_kg)}` : ''}
                    </span>
                    <span className={styles.recentDetail}>
                      {waitedFor(row.warehouse_stage_at)} in this stage
                    </span>
                    {row.has_problem && (
                      <span className={styles.rowProblem}>Problem: {row.problem_note}</span>
                    )}
                  </span>
                  <span className={styles.rowBadges}>
                    <StagePill stage={row.warehouse_stage} label={row.warehouse_stage_display} />
                    {row.overdue && <StatusBadge tone="attention">Too long</StatusBadge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
