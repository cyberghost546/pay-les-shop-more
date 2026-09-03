// src/components/Loading/Loading.jsx
import { useEffect, useState } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Loading.module.css';

// How long to wait before admitting something is wrong. Under half a second a
// spinner flashing on screen is more distracting than no spinner at all, and
// after ten seconds the visitor deserves to be told the connection is slow
// rather than left watching an animation forever.
const SPINNER_DELAY_MS = 400;
const SLOW_AFTER_MS = 10000;

/**
 * Full-height loading state. `inline` renders it inside a card instead of
 * claiming the whole page.
 */
export default function Loading({ inline = false }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), SPINNER_DELAY_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(slowTimer);
    };
  }, []);

  // Nothing painted during the first moments: fast loads show no flicker.
  if (!visible) return null;

  return (
    <div
      className={inline ? styles.inline : styles.page}
      // Announced once, politely — not interrupting whatever is being read.
      role="status"
      aria-live="polite"
    >
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{t('loading.message')}</p>
      {slow && <p className={styles.slow}>{t('loading.slow')}</p>}
    </div>
  );
}
