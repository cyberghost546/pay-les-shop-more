// src/components/OrderCta/OrderCta.jsx
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './OrderCta.module.css';

// Drop a poster image in src/images/, import it, and set this to the import to
// turn the placeholder into a real video thumbnail.
const VIDEO_POSTER = null;

// The URL of the video itself. While it is null the panel stays a still
// placeholder rather than a play button that does nothing.
const VIDEO_URL = null;

export default function OrderCta() {
  const { t } = useLanguage();

  return (
    <section className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.copy}>
          <h2 className={styles.title}>
            <span className={styles.titleAccent}>{t('home.cta.titleAccent')}</span>
            <span className={styles.titleRest}>{t('home.cta.title')}</span>
          </h2>
          <hr className={styles.rule} />

          <Link to="/contact" className={styles.button}>
            {t('home.cta.button')}
          </Link>
        </div>

        <p className={styles.body}>{t('home.cta.body')}</p>
      </div>

      {VIDEO_URL ? (
        <a
          className={styles.video}
          href={VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('home.cta.videoLabel')}
          style={
            VIDEO_POSTER ? { backgroundImage: `url(${VIDEO_POSTER})` } : undefined
          }
        >
          <span className={styles.play} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" />
              <path d="M10 8.2 16 12l-6 3.8Z" fill="currentColor" stroke="none" />
            </svg>
          </span>
        </a>
      ) : (
        // No video yet: a play button that does nothing is worse than a slot
        // that says what belongs here.
        <div className={styles.videoSlot}>{t('home.cta.videoSlot')}</div>
      )}
    </section>
  );
}
