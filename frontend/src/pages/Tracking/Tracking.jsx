// src/pages/Tracking/Tracking.jsx
import TrackingPanel from '../../components/TrackingPanel/TrackingPanel';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Tracking.module.css';

/**
 * A page around the same panel the homepage uses, so "Tracking" in the
 * navigation and the hero's box are the same feature rather than two.
 */
export default function Tracking() {
  const { t } = useLanguage();

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('tracking.pageTitle')}</h1>
        <p className={styles.lead}>{t('tracking.pageLead')}</p>
      </header>

      <TrackingPanel autoFocus />
    </main>
  );
}
