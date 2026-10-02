// src/pages/Profile/ShipmentDetails.jsx
//
// What opens under a shipment in "My shipments" when the customer clicks it:
//
//   1. How long it will still take - the expected arrival and the days left,
//      or when it was delivered, or (not shipped yet) the usual sailing time.
//   2. Where it is - a progress bar and the stage-by-stage timeline.
//   3. The facts - destination, dates, weight, value.
//   4. The invoice for this shipment, with a download link.
//   5. The "this shipment can no longer be changed" notice, when it applies.
//
// Every date and stage comes from the server (the same reading as Track &
// Trace, see backend accounts/public.py); nothing here guesses where a
// shipment is. The one estimate - the usual sailing time when there is no
// expected arrival yet - comes from src/data/destinations.js and says so.

import ShipmentTimeline from '../../components/ShipmentTimeline/ShipmentTimeline';
import { DESTINATIONS } from '../../data/destinations';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from today to a date ('2026-10-15'), negative when past. */
function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  return Math.round((target - today) / DAY);
}

/** "Curaçao" and "curacao" are the same island. */
function plain(text) {
  return String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The island's entry in destinations.js, matched on the destination name
 * the server sends (e.g. "Curaçao"), or undefined.
 */
function findIsland(destination) {
  if (!destination) return undefined;
  return DESTINATIONS.find(
    (island) => plain(island.slug) === plain(destination),
  );
}

/**
 * The "how long" box: one headline and, where there is one, a line under it.
 * Returns translation-ready strings.
 */
function useTiming(shipment, formatDay) {
  const { t } = useLanguage();
  const text = (key, values) =>
    fill(t(`profile.shipments.details.${key}`), values);

  if (shipment.status === 'cancelled') return null;

  if (shipment.delivered_at) {
    const delivered = new Date(shipment.delivered_at);
    const took = shipment.shipped_at
      ? Math.max(
          1,
          Math.round((delivered - new Date(shipment.shipped_at)) / DAY),
        )
      : null;
    return {
      // Past tense: it has arrived.
      label: 'howLongWas',
      headline: text('deliveredOn', { date: formatDay(delivered) }),
      line: took ? text('took', { days: took }) : null,
    };
  }

  // On the island, waiting to be handed over: the expected arrival has
  // been reached, so it is not "late" - the next step is the agent's call.
  if (shipment.status === 'arrived') {
    return { headline: text('arrived'), line: text('arrivedNext') };
  }

  if (shipment.estimated_arrival) {
    const days = daysUntil(shipment.estimated_arrival);
    const [y, m, d] = shipment.estimated_arrival.split('-').map(Number);
    const date = formatDay(new Date(y, m - 1, d));
    if (days > 1) {
      return {
        headline: text('arrivalOn', { date }),
        line: text('daysLeft', { days }),
      };
    }
    if (days === 1)
      return { headline: text('arrivalOn', { date }), line: text('tomorrow') };
    if (days === 0)
      return { headline: text('arrivalOn', { date }), line: text('today') };
    // Past the expected date and not delivered: said honestly, not hidden.
    return { headline: text('arrivalOn', { date }), line: text('late') };
  }

  // No expected arrival yet. If the island is known, the usual sailing time
  // as an indication - clearly labelled as one.
  const island = findIsland(shipment.destination);
  return {
    headline: text('notShipped'),
    line: island
      ? text('typical', { island: t(island.nameKey), days: island.transitDays })
      : null,
  };
}

/**
 * @param {object} props
 * @param {object} props.shipment   one row from /api/packages/
 * @param {object[]} props.invoices the customer's invoices (any shipment)
 * @param {Intl.DateTimeFormat} props.dateFormat  date and time
 * @param {{ title: string, body: string } | null} props.lock  see Shipments
 */
export default function ShipmentDetails({
  shipment,
  invoices,
  dateFormat,
  lock,
}) {
  const { t, language } = useLanguage();
  const dayFormat = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
  });
  const label = (key) => t(`profile.shipments.details.${key}`);

  const timing = useTiming(shipment, (date) => dayFormat.format(date));
  const ownInvoices = invoices.filter(
    (invoice) => invoice.trackingNumber === shipment.tracking_number,
  );

  // The timeline's stage names in the page's language; the server's English
  // name stays the fallback for a stage this page does not know yet.
  const stages = (shipment.stages ?? []).map((stage) => {
    const key = `profile.shipments.stages.${stage.value}`;
    const translated = t(key);
    return {
      value: stage.value,
      label: translated === key ? stage.label : translated,
    };
  });

  const facts = [
    [label('destination'), shipment.destination || label('unknown')],
    [label('registered'), dateFormat.format(new Date(shipment.created_at))],
    [
      label('shipped'),
      shipment.shipped_at
        ? dateFormat.format(new Date(shipment.shipped_at))
        : label('notYet'),
    ],
    shipment.delivered_at
      ? [label('delivered'), dateFormat.format(new Date(shipment.delivered_at))]
      : null,
    shipment.weight_kg
      ? [label('weight'), `${Number(shipment.weight_kg)} kg`]
      : null,
    shipment.value_eur
      ? [label('value'), money.format(Number(shipment.value_eur))]
      : null,
  ].filter(Boolean);

  return (
    <div className={styles.shipmentDetails}>
      {/* 1. How long it will still take - the question the customer
          opened this for, so it comes first. */}
      {timing && (
        <div className={styles.shipmentTiming}>
          <p className={styles.shipmentTimingLabel}>
            {label(timing.label ?? 'howLong')}
          </p>
          <p className={styles.shipmentTimingHeadline}>{timing.headline}</p>
          {timing.line && (
            <p className={styles.shipmentTimingLine}>{timing.line}</p>
          )}
        </div>
      )}

      {/* 2. Where it is. Not for a cancelled shipment: it is not anywhere. */}
      {shipment.status !== 'cancelled' && stages.length > 0 && (
        <div className={styles.shipmentJourney}>
          <p className={styles.shipmentSectionTitle}>{label('journey')}</p>
          <div
            className={styles.shipmentProgress}
            role="progressbar"
            aria-label={label('progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shipment.progress ?? 0}
          >
            <div
              className={styles.shipmentProgressBar}
              style={{ width: `${shipment.progress ?? 0}%` }}
            />
          </div>
          <ShipmentTimeline
            stages={stages}
            currentIndex={shipment.stage_index ?? -1}
            compact
          />
        </div>
      )}

      {/* 3. The facts. */}
      <dl className={styles.shipmentFacts}>
        {facts.map(([term, value]) => (
          <div key={term} className={styles.shipmentFact}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {/* 4. This shipment's invoice(s). */}
      <div>
        <p className={styles.shipmentSectionTitle}>{label('invoice')}</p>
        {ownInvoices.length === 0 ? (
          <p className={styles.invoiceMeta}>{label('noInvoice')}</p>
        ) : (
          <ul className={styles.shipmentInvoices}>
            {ownInvoices.map((invoice) => (
              <li key={invoice.id} className={styles.shipmentInvoice}>
                <span className={styles.invoiceNumber}>{invoice.number}</span>
                {invoice.valueEur != null && (
                  <span className={styles.invoiceMeta}>
                    {money.format(Number(invoice.valueEur))}
                  </span>
                )}
                {/* A plain link: the session cookie rides along, and the
                    server sends the PDF as a download. */}
                <a
                  className={styles.invoiceDownload}
                  href={invoice.downloadUrl}
                  download
                >
                  {t('profile.invoices.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. The read-only notice. Stated on the shipment itself rather than
          left to be inferred from the absence of buttons: what the customer
          needs to know is that their next purchase travels on its own
          shipment. */}
      {lock && (
        <div className={styles.shipmentLocked}>
          <p className={styles.shipmentLockedTitle}>{t(lock.title)}</p>
          <p className={styles.invoiceMeta}>{t(lock.body)}</p>
        </div>
      )}
    </div>
  );
}
