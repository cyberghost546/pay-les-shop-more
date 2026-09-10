// src/pages/Profile/Shipments.jsx
//
// The customer's shipment history: one card per shipment, never one merged
// list of everything they have ever sent.
//
// That separation is the point of the card rather than a layout preference.
// A customer who buys something after their first shipment has left ends up
// with two shipments, each with its own tracking number and its own journey,
// and the question they actually have — "which of my things is on which
// boat" — is only answerable if the page keeps them apart. A shipment that
// has gone is drawn as a record: its own notice, and nothing to press.

import { useEffect, useState } from 'react';
import { listPackages } from '../../api/profile';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

/**
 * Which sentence a locked shipment gets.
 *
 * `locked` comes from the server, so this decides only the wording. Which
 * statuses mean "gone" is a rule and lives on the model with the code that
 * enforces it.
 */
function lockKey(shipment) {
  if (!shipment.locked) return null;
  if (shipment.status === 'delivered') return 'profile.shipments.locked.delivered';
  if (shipment.status === 'cancelled') return 'profile.shipments.locked.cancelled';
  return 'profile.shipments.locked.body';
}

export default function Shipments() {
  const { t, language } = useLanguage();

  const [shipments, setShipments] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listPackages()
      .then((rows) => {
        if (cancelled) return;
        setShipments(rows);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      // Stops a slow response from landing after the visitor has moved on.
      cancelled = true;
    };
  }, [attempt]);

  const dateFormat = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (state === 'loading') {
    return <p className={styles.invoiceMessage}>{t('profile.shipments.loading')}</p>;
  }

  if (state === 'error') {
    return (
      <p className={styles.failure} role="alert">
        {t('profile.shipments.failed')}{' '}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setState('loading');
            setAttempt((n) => n + 1);
          }}
        >
          {t('profile.invoices.retry')}
        </button>
      </p>
    );
  }

  if (shipments.length === 0) {
    return <p className={styles.invoiceMessage}>{t('profile.shipments.empty')}</p>;
  }

  return (
    <>
      <p className={styles.cardIntro}>{t('profile.shipments.intro')}</p>

      <ul className={styles.shipmentList}>
        {shipments.map((shipment) => (
          <li key={shipment.id} className={styles.shipment}>
            <div className={styles.shipmentHead}>
              <p className={styles.invoiceNumber}>{shipment.tracking_number}</p>
              <span className={styles.shipmentStatus}>{shipment.status_display}</span>
            </div>

            {shipment.description && (
              <p className={styles.invoiceMeta}>{shipment.description}</p>
            )}

            <p className={styles.invoiceMeta}>
              {shipment.shipped_at
                ? `${t('profile.shipments.shipped')} ${dateFormat.format(
                    new Date(shipment.shipped_at),
                  )}`
                : t('profile.shipments.notShippedYet')}
              {shipment.delivered_at &&
                ` · ${t('profile.shipments.delivered')} ${dateFormat.format(
                  new Date(shipment.delivered_at),
                )}`}
            </p>

            {/* The read-only notice. Stated on the shipment itself rather than
                left to be inferred from the absence of buttons: what the
                customer needs to know is not that this card has no controls,
                but that their next purchase travels on its own shipment. */}
            {lockKey(shipment) && (
              <div className={styles.shipmentLocked}>
                <p className={styles.shipmentLockedTitle}>
                  {t('profile.shipments.locked.title')}
                </p>
                <p className={styles.invoiceMeta}>{t(lockKey(shipment))}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
