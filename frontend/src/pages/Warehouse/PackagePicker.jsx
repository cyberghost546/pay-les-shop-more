// src/pages/Warehouse/PackagePicker.jsx
//
// "Which package?" - the step in front of a form on a page that is not about
// one package yet. It offers the queue the page works from, and a search for
// anything outside it: tracking number, customer, or rack location.

import { useState } from 'react';
import { listWarehouseShipments } from '../../api/staff';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { useLanguage } from '../../i18n/useLanguage';
import { useLoad } from './useLoad';
import styles from './Ops.module.css';

const PAGE_SIZE = 12;

/**
 * @param {{ stages: string[], onPick: (row: object) => void, onCancel: () => void }} props
 *   stages: the queue shown while the search box is empty
 */
export default function PackagePicker({ stages, onPick, onCancel }) {
  const { t } = useLanguage();
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const stage = stages.join(',');
  const { state, data, reload } = useLoad(
    () =>
      listWarehouseShipments(
        search ? { search, page_size: PAGE_SIZE } : { stage, page_size: PAGE_SIZE },
      ),
    `pick:${stage}:${search}`,
  );

  function submit(event) {
    event.preventDefault();
    setSearch(term.trim());
  }

  return (
    <>
      <form onSubmit={submit} className={`${styles.fields} ${styles.alignEnd}`}>
        <label className={styles.field}>
          <span className={styles.label}>{t('dashboard.flow.picker.searchLabel')}</span>
          <input
            className={styles.input}
            value={term}
            autoComplete="off"
            autoFocus
            placeholder={t('dashboard.flow.picker.searchPlaceholder')}
            onChange={(event) => setTerm(event.target.value)}
          />
        </label>
        <button type="submit" className={styles.secondary}>
          {t('dashboard.flow.picker.searchButton')}
        </button>
      </form>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'ready' &&
        (data.results.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.flow.picker.noMatches')}</p>
        ) : (
          <ul className={`${styles.rows} ${styles.gapTop}`}>
            {data.results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`${styles.row} ${styles.rowButton}`}
                  onClick={() => onPick(row)}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{row.tracking_number}</span>
                    <span className={styles.rowDetail}>
                      {row.customer}
                      {row.warehouse_location && ` · ${row.warehouse_location}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      <button
        type="button"
        className={`${styles.secondary} ${styles.wide} ${styles.gapTop}`}
        onClick={onCancel}
      >
        {t('dashboard.flow.common.cancel')}
      </button>
    </>
  );
}
