// src/components/ConnectionError/ConnectionError.jsx
import { useLanguage } from '../../i18n/useLanguage';
import styles from './ConnectionError.module.css';

/**
 * Shown when data could not be fetched. `onRetry` is what makes this useful:
 * a dead end tells the visitor nothing they can act on.
 *
 * @param {{ onRetry?: () => void, retrying?: boolean, inline?: boolean,
 *           messageKey?: string }} props
 */
export default function ConnectionError({
  onRetry,
  retrying = false,
  inline = false,
  messageKey = 'loading.failedBody',
}) {
  const { t } = useLanguage();

  return (
    // role="alert" so it is announced immediately: the visitor is waiting on it.
    <div className={inline ? styles.inline : styles.page} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.2" r=".9" fill="currentColor" stroke="none" />
        </svg>
      </span>

      <h2 className={styles.title}>{t('loading.failedTitle')}</h2>
      <p className={styles.body}>{t(messageKey)}</p>

      {onRetry && (
        <button
          type="button"
          className={styles.retry}
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? t('loading.retrying') : t('loading.retry')}
        </button>
      )}
    </div>
  );
}
