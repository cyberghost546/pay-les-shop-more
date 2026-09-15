// src/pages/Warehouse/opsUi.jsx
//
// Small pieces the warehouse operation screens share.

import styles from './Ops.module.css';

/** A large, unmissable success/error/info line. Nothing when empty. */
export function Message({ tone = 'info', children }) {
  if (!children) return null;
  const toneClass = {
    success: styles.messageSuccess,
    error: styles.messageError,
    info: styles.messageInfo,
  }[tone];
  return (
    <p className={`${styles.message} ${toneClass}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/**
 * A package's history, oldest at the top, in the order it happened.
 *
 * @param {{ entries: object[] }} props rows from getPackageTimeline
 */
export function Timeline({ entries }) {
  if (!entries.length) return <p className={styles.empty}>Nothing has happened to this package yet.</p>;

  return (
    <ol className={styles.timeline}>
      {entries.map((entry) => {
        const tone =
          entry.source === 'office'
            ? styles.eventOffice
            : entry.action.startsWith('damage') || entry.action.startsWith('problem')
              ? styles.eventDamage
              : '';
        return (
          <li key={entry.id} className={`${styles.event} ${tone}`}>
            <div className={styles.eventHead}>
              <span className={styles.eventTime}>{entry.time}</span>
              <span className={styles.eventAction}>{entry.action_display}</span>
            </div>
            <div className={styles.eventMeta}>
              {entry.user?.name ?? 'System'}
              {entry.date && ` · ${entry.date}`}
            </div>
            {entry.description && <p className={styles.eventDetail}>{entry.description}</p>}
          </li>
        );
      })}
    </ol>
  );
}
