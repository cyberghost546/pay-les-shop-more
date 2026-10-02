// src/components/Tutorial/TutorialProgress.jsx
//
// "Step 3 of 8" and a bar that fills up as the visitor goes through the tour.

import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Tutorial.module.css';

/**
 * @param {object} props
 * @param {number} props.current  1-based step number
 * @param {number} props.total
 */
export default function TutorialProgress({ current, total }) {
  const { t } = useLanguage();
  const label = fill(t('onboarding.stepOf'), { current, total });

  return (
    <div className={styles.progress}>
      <p className={styles.progressText}>{label}</p>
      {/* A real progressbar for screen readers; the text above says the
          same thing for everyone else. */}
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={t('onboarding.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={label}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
