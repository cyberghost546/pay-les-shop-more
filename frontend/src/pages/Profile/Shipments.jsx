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
import {
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  ShipIcon,
} from '../../components/Icons/icons';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

/**
 * The heading and sentence a locked shipment gets, as translation keys, or
 * null when it is not locked.
 *
 * `locked` comes from the server, so this decides only the wording. Which
 * statuses mean "gone" is a rule and lives on the model with the code that
 * enforces it. A delivered or cancelled shipment gets its own heading: "On
 * its way" above "this was delivered" read as a contradiction.
 */
function lockText(shipment) {
  if (!shipment.locked) return null;
  if (shipment.status === 'delivered') {
    return {
      title: 'profile.shipments.locked.titleDelivered',
      body: 'profile.shipments.locked.delivered',
    };
  }
  if (shipment.status === 'cancelled') {
    return {
      title: 'profile.shipments.locked.titleCancelled',
      body: 'profile.shipments.locked.cancelled',
    };
  }
  return {
    title: 'profile.shipments.locked.title',
    body: 'profile.shipments.locked.body',
  };
}

// The three headings the list is split under, in the order they are shown,
// plus cancelled shipments at the very end. Which status goes where is only
// about presentation; the texts are profile.shipments.groups.<id>.
// Each group also has its own icon and colour (the colours are in
// Profile.module.css, under .shipmentGroup[data-group=...]).
const GROUPS = [
  {
    id: 'toSend',
    statuses: ['quoted', 'paid', 'purchased', 'ready_for_shipping'],
    Icon: ClockIcon,
  },
  { id: 'onTheWay', statuses: ['in_transit', 'arrived'], Icon: ShipIcon },
  { id: 'received', statuses: ['delivered'], Icon: CheckCircleIcon },
  { id: 'cancelled', statuses: ['cancelled'], Icon: CloseIcon },
];

/**
 * Which group a shipment belongs in. A status this list does not know yet
 * (one added on the server later) is placed by its dates instead, so it
 * still shows up somewhere sensible rather than disappearing.
 */
function groupOf(shipment) {
  const known = GROUPS.find((group) =>
    group.statuses.includes(shipment.status),
  );
  if (known) return known.id;
  if (shipment.delivered_at) return 'received';
  if (shipment.shipped_at) return 'onTheWay';
  return 'toSend';
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

  // Date and time, e.g. "12 sep 2026, 16:30" - when a shipment left or
  // arrived is something customers plan around, so the time is shown too.
  const dateFormat = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (state === 'loading') {
    return (
      <p className={styles.invoiceMessage}>{t('profile.shipments.loading')}</p>
    );
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
    return (
      <p className={styles.invoiceMessage}>{t('profile.shipments.empty')}</p>
    );
  }

  // The status in the page's language. The server sends it in English
  // only (status_display); that stays the fallback for a status this page
  // has no translation for yet.
  function statusLabel(shipment) {
    const key = `profile.shipments.status.${shipment.status}`;
    const label = t(key);
    return label === key ? shipment.status_display : label;
  }

  return (
    <>
      <p className={styles.cardIntro}>{t('profile.shipments.intro')}</p>

      {/* One heading per group, with how many are in it. Empty groups are
          left out, so a customer with only delivered shipments sees only
          "Received". */}
      {GROUPS.map((group) => {
        const inGroup = shipments.filter(
          (shipment) => groupOf(shipment) === group.id,
        );
        if (inGroup.length === 0) return null;

        return (
          // data-group picks the group's colour in the CSS.
          <section
            key={group.id}
            className={styles.shipmentGroup}
            data-group={group.id}
          >
            <h3 className={styles.shipmentGroupTitle}>
              <span className={styles.shipmentGroupIcon}>
                <group.Icon size={16} />
              </span>
              {t(`profile.shipments.groups.${group.id}`)}
              <span className={styles.shipmentGroupCount}>
                {inGroup.length}
              </span>
            </h3>

            <ul className={styles.shipmentList}>
              {inGroup.map((shipment) => {
                const lock = lockText(shipment);

                return (
                  <li key={shipment.id} className={styles.shipment}>
                    <div className={styles.shipmentHead}>
                      <p className={styles.invoiceNumber}>
                        {shipment.tracking_number}
                      </p>
                      <span className={styles.shipmentStatus}>
                        {statusLabel(shipment)}
                      </span>
                    </div>

                    {shipment.description && (
                      <p className={styles.invoiceMeta}>
                        {shipment.description}
                      </p>
                    )}

                    <p className={styles.invoiceMeta}>
                      {/* Not shipped yet: when it was registered with us, so
                          the customer still sees a date and time for it. */}
                      {shipment.shipped_at
                        ? `${t('profile.shipments.shipped')} ${dateFormat.format(
                            new Date(shipment.shipped_at),
                          )}`
                        : `${t('profile.shipments.registered')} ${dateFormat.format(
                            new Date(shipment.created_at),
                          )} · ${t('profile.shipments.notShippedYet')}`}
                      {shipment.delivered_at &&
                        ` · ${t('profile.shipments.delivered')} ${dateFormat.format(
                          new Date(shipment.delivered_at),
                        )}`}
                    </p>

                    {/* The read-only notice. Stated on the shipment itself
                        rather than left to be inferred from the absence of
                        buttons: what the customer needs to know is not that
                        this card has no controls, but that their next
                        purchase travels on its own shipment. */}
                    {lock && (
                      <div className={styles.shipmentLocked}>
                        <p className={styles.shipmentLockedTitle}>
                          {t(lock.title)}
                        </p>
                        <p className={styles.invoiceMeta}>{t(lock.body)}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
