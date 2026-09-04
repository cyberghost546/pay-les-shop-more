// src/pages/Dashboard/ui.jsx
//
// The small presentational pieces the dashboard pages share. Components only,
// so React Fast Refresh can hot-reload this file.

import styles from './Dashboard.module.css';

/**
 * A coloured pill for a status value.
 *
 * `tone` is the meaning, not the colour: "this needs attention", "this is
 * finished". Mapping meaning to a palette in one place is what keeps a
 * delivered package and an accepted quote looking alike across three pages.
 *
 * @param {{ tone?: 'neutral'|'attention'|'progress'|'done'|'off',
 *           children: import('react').ReactNode }} props
 */
export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

/** A count in the corner of a nav item — hidden entirely when it is zero. */
export function CountPill({ value }) {
  if (!value) return null;
  return <span className={styles.countPill}>{value}</span>;
}

/** The filter row above a table. */
export function Toolbar({ children }) {
  return <div className={styles.toolbar}>{children}</div>;
}

/**
 * @param {{ value: string, onChange: (value: string) => void,
 *           label: string, placeholder?: string }} props
 */
export function SearchInput({ value, onChange, label, placeholder }) {
  return (
    <label className={styles.search}>
      {/* Visible label kept off-screen: the placeholder disappears as soon as
          someone types, which leaves a screen reader with an unnamed box. */}
      <span className={styles.srOnly}>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
        className={styles.searchInput}
      />
    </label>
  );
}

/**
 * @param {{ value: string, onChange: (value: string) => void, label: string,
 *           options: {value: string, label: string}[], allLabel?: string }} props
 */
export function FilterSelect({ value, onChange, label, options, allLabel = 'All' }) {
  return (
    <label className={styles.filter}>
      <span className={styles.filterLabel}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={styles.select}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown in place of the table when a filter matches nothing. */
export function Empty({ children }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * Previous/next for a paged list. DRF tells us whether the neighbouring pages
 * exist, so the buttons disable themselves rather than fetching a 404.
 *
 * @param {{ page: number, count: number, hasNext: boolean,
 *           hasPrevious: boolean, onChange: (page: number) => void }} props
 */
export function Pagination({ page, count, hasNext, hasPrevious, onChange }) {
  // One page of results needs no controls at all.
  if (!hasNext && !hasPrevious) return null;

  return (
    <nav className={styles.pagination} aria-label="Pages">
      <button
        type="button"
        className={styles.pageButton}
        onClick={() => onChange(page - 1)}
        disabled={!hasPrevious}
      >
        Previous
      </button>
      <span className={styles.pageStatus}>
        Page {page} — {count} in total
      </span>
      <button
        type="button"
        className={styles.pageButton}
        onClick={() => onChange(page + 1)}
        disabled={!hasNext}
      >
        Next
      </button>
    </nav>
  );
}

/**
 * The inline status select that appears in a table row.
 *
 * @param {{ value: string, options: {value: string, label: string}[],
 *           onChange: (value: string) => void, busy?: boolean,
 *           label: string }} props
 */
export function StatusSelect({ value, options, onChange, busy = false, label }) {
  return (
    <label>
      <span className={styles.srOnly}>{label}</span>
      <select
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        className={styles.rowSelect}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A message above a table: something saved, or something failed to save. */
export function Banner({ tone = 'info', children }) {
  if (!children) return null;
  return (
    <p className={`${styles.banner} ${styles[`banner_${tone}`]}`} role="status">
      {children}
    </p>
  );
}
