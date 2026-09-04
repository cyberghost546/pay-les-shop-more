// src/components/TrackingPanel/TrackingPanel.jsx
import { useState } from 'react';
import { TRACKING_ERRORS, trackShipment } from '../../api/tracking';
import ShipmentTimeline from '../ShipmentTimeline/ShipmentTimeline';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './TrackingPanel.module.css';

const FAILURE_KEYS = {
  [TRACKING_ERRORS.NOT_FOUND]: 'tracking.errors.notFound',
  [TRACKING_ERRORS.RATE_LIMITED]: 'tracking.errors.tooMany',
  [TRACKING_ERRORS.UNAVAILABLE]: 'tracking.errors.offline',
};

/**
 * The tracking search box and its result.
 *
 * Reusable on purpose: it sits in the homepage hero and is the whole of the
 * /tracking page. `variant="hero"` is the light-on-dark treatment.
 *
 * @param {{ variant?: 'hero' | 'page', autoFocus?: boolean }} props
 */
export default function TrackingPanel({ variant = 'page', autoFocus = false }) {
  const { t, language } = useLanguage();

  const [number, setNumber] = useState('');
  // 'idle' | 'loading' | 'found' | 'error'
  const [state, setState] = useState('idle');
  const [shipment, setShipment] = useState(null);
  const [failureKey, setFailureKey] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const query = number.trim();
    if (!query) {
      setState('error');
      setFailureKey('tracking.errors.required');
      return;
    }

    setState('loading');
    setFailureKey(null);

    try {
      setShipment(await trackShipment(query));
      setState('found');
    } catch (error) {
      setShipment(null);
      setFailureKey(FAILURE_KEYS[error.code] ?? 'tracking.errors.offline');
      setState('error');
    }
  }

  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(value))
      : t('tracking.notKnown');

  return (
    <section
      className={
        variant === 'hero' ? `${styles.panel} ${styles.hero}` : styles.panel
      }
    >
      <h2 className={styles.title}>{t('tracking.title')}</h2>
      <p className={styles.subtitle}>{t('tracking.subtitle')}</p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label className={styles.field}>
          <span className={styles.srOnly}>{t('tracking.label')}</span>
          <input
            className={styles.input}
            type="text"
            name="tracking"
            value={number}
            onChange={(event) => {
              setNumber(event.target.value);
              // Clearing on edit, so a stale "not found" does not sit under a
              // number the visitor is halfway through correcting.
              if (state === 'error') setState('idle');
            }}
            placeholder={t('tracking.placeholder')}
            autoComplete="off"
            // Codes are not words; stop phones from capitalising or
            // autocorrecting them.
            autoCapitalize="characters"
            spellCheck="false"
            autoFocus={autoFocus}
            aria-invalid={state === 'error'}
          />
        </label>

        <button type="submit" className={styles.submit} disabled={state === 'loading'}>
          {state === 'loading' ? t('tracking.searching') : t('tracking.submit')}
        </button>
      </form>

      {/* aria-live so the result is announced when it arrives — the visitor is
          waiting on it and may not be looking at this part of the page. */}
      <div className={styles.result} aria-live="polite">
        {state === 'idle' && (
          <p className={styles.hint}>{t('tracking.hint')}</p>
        )}

        {state === 'loading' && (
          <p className={styles.hint}>
            <span className={styles.spinner} aria-hidden="true" />
            {t('tracking.searching')}
          </p>
        )}

        {state === 'error' && (
          <p className={styles.error} role="alert">
            {t(failureKey)}
          </p>
        )}

        {state === 'found' && shipment && (
          <div className={styles.shipment}>
            <div className={styles.shipmentHead}>
              <div>
                <p className={styles.shipmentLabel}>{t('tracking.number')}</p>
                <p className={styles.shipmentNumber}>{shipment.tracking_number}</p>
              </div>
              <span
                className={
                  shipment.status === 'delivered'
                    ? `${styles.badge} ${styles.badgeDone}`
                    : shipment.status === 'cancelled'
                      ? `${styles.badge} ${styles.badgeOff}`
                      : styles.badge
                }
              >
                {shipment.status_display}
              </span>
            </div>

            <div className={styles.facts}>
              <div className={styles.fact}>
                <p className={styles.factLabel}>{t('tracking.destination')}</p>
                <p className={styles.factValue}>
                  {shipment.destination || t('tracking.notKnown')}
                </p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>{t('tracking.shipped')}</p>
                <p className={styles.factValue}>{formatDate(shipment.shipped_at)}</p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>
                  {shipment.delivered_at
                    ? t('tracking.delivered')
                    : t('tracking.expected')}
                </p>
                <p className={styles.factValue}>
                  {formatDate(shipment.delivered_at ?? shipment.estimated_arrival)}
                </p>
              </div>
            </div>

            <div className={styles.progressRow}>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={shipment.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('tracking.progress')}
              >
                <div
                  className={styles.progressBar}
                  style={{ width: `${shipment.progress}%` }}
                />
              </div>
              <span className={styles.progressValue}>{shipment.progress}%</span>
            </div>

            <ShipmentTimeline
              stages={shipment.stages}
              currentIndex={shipment.stage_index}
              cancelled={shipment.status === 'cancelled'}
              compact
            />

            {/* Said plainly rather than left for the visitor to notice: this
                page shows less than the account page does, and that is a
                choice rather than an omission. */}
            <p className={styles.note}>{t('tracking.privacyNote')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
