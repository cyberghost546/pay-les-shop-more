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
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import StagePill from './StagePill';
import { waitedFor } from './waited';
import styles from './Warehouse.module.css';

const SHOW = ['attention', 'damaged', 'problem', 'overdue'];

// Module scope, so useCollection sees one stable function. The page's single
// "show" choice becomes one of the API's separate flags here.
const fetchShipments = ({ show, ...filters }) =>
  listWarehouseShipments({
    ...filters,
    ...(show ? { [show]: 'true' } : {}),
  });

function titleFor(filters, t) {
  if (SHOW.includes(filters.show)) return t(`dashboard.flow.list.${filters.show}`);
  const stage = WAREHOUSE_STAGES.find((option) => option.value === filters.stage);
  return stage ? t(`dashboard.flow.stages.${stage.value}`) : t('dashboard.flow.list.title');
}

export default function ShipmentList() {
  const { t } = useLanguage();
  const [params] = useSearchParams();

  const list = useCollection(
    fetchShipments,
    {
      stage: params.get('stage') ?? '',
      show: SHOW.find((value) => params.get(value) === 'true') ?? '',
    },
    params.get('search') ?? '',
  );

  return (
    <>
      <header className={dashboard.head}>
        <h1 className={dashboard.title}>{titleFor(list.filters, t)}</h1>
        <p className={dashboard.subtitle}>{t('dashboard.flow.list.lead')}</p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={t('dashboard.flow.list.search')}
          placeholder={t('dashboard.flow.list.searchPlaceholder')}
        />
        <FilterSelect
          label={t('dashboard.flow.list.stage')}
          value={list.filters.stage}
          onChange={(value) => list.setFilter('stage', value)}
          options={WAREHOUSE_STAGES.map((stage) => ({ value: stage.value, label: t(`dashboard.flow.stages.${stage.value}`) }))}
          allLabel={t('dashboard.flow.list.everyStage')}
        />
        <FilterSelect
          label={t('dashboard.flow.list.show')}
          value={list.filters.show}
          onChange={(value) => list.setFilter('show', value)}
          options={SHOW.map((value) => ({ value, label: t(`dashboard.flow.list.${value}`) }))}
          allLabel={t('dashboard.flow.list.everything')}
        />
      </Toolbar>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{t('dashboard.flow.list.empty')}</Empty>
        ) : (
          <ul className={`${dashboard.card} ${styles.recent}`}>
            {list.rows.map((row) => (
              <li key={row.id}>
                <Link to={`/warehouse/packages/${row.id}`} className={styles.recentRow}>
                  <span className={styles.recentMain}>
                    <span className={styles.recentLabel}>{row.tracking_number}</span>
                    <span className={styles.recentDetail}>
                      {row.customer} · {row.destination || t('dashboard.flow.list.noDestination')}
                      {row.warehouse_location ? ` · ${row.warehouse_location}` : ''}
                      {row.weight_kg ? ` · ${formatWeight(row.weight_kg)}` : ''}
                    </span>
                    {row.has_open_damage && <span className={styles.rowProblem}>{t('dashboard.flow.list.openDamage')}</span>}
                    <span className={styles.recentDetail}>
                      {fill(t('dashboard.flow.list.inStage'), { time: waitedFor(row.warehouse_stage_at) })}
                    </span>
                    {row.has_problem && (
                      <span className={styles.rowProblem}>{fill(t('dashboard.flow.list.problemNote'), { note: row.problem_note })}</span>
                    )}
                  </span>
                  <span className={styles.rowBadges}>
                    <StagePill stage={row.warehouse_stage} label={t(`dashboard.flow.stages.${row.warehouse_stage}`)} />
                    {row.overdue && <StatusBadge tone="attention">{t('dashboard.flow.list.tooLong')}</StatusBadge>}
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
