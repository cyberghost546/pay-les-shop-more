// src/pages/Profile/Shipments.jsx
//
// The customer's shipment history: one card per shipment, never one merged
// list of everything they have ever sent.
//
// The groups ("Nog te verzenden", "Onderweg", ...) fold open and closed
// like a dropdown: click the heading. Each shipment in them is a slim bar -
// order number, what is in it, status, one date. Clicking it opens a pop-up
// window (HelpDialog) with the details: how long it will still take, where
// it is, the facts and its invoice (ShipmentDetails.jsx).
//
// That separation is the point of the card rather than a layout preference.
// A customer who buys something after their first shipment has left ends up
// with two shipments, each with its own tracking number and its own journey,
// and the question they actually have — "which of my things is on which
// boat" — is only answerable if the page keeps them apart. A shipment that
// has gone is drawn as a record: its own notice, and nothing to press.

import { useEffect, useId, useState } from 'react';
import { listPackages } from '../../api/profile';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  ShipIcon,
} from '../../components/Icons/icons';
import { useLanguage } from '../../i18n/useLanguage';
import HelpDialog from '../../components/HelpDialog/HelpDialog';
import ShipmentDetails from './ShipmentDetails';
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
// Which groups start open: the ones with something still happening. The
// history (received, cancelled) starts folded, showing only its count.
const OPEN_AT_START = ['toSend', 'onTheWay'];

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

/**
 * @param {object} props
 * @param {object[]} [props.invoices]  the customer's invoices, loaded by the
 *   profile page for "My invoices"; each shipment shows its own.
 */
export default function Shipments({ invoices = [] }) {
  const { t, language } = useLanguage();
  // Which shipment is open (its id), or null. One at a time.
  const [openId, setOpenId] = useState(null);
  // The groups that are unfolded, by id.
  const [openGroups, setOpenGroups] = useState(() => new Set(OPEN_AT_START));
  const idBase = useId();

  function toggleGroup(id) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
  // Just the day, for the one date on a closed bar: "15 okt".
  const shortDay = new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
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

  // The shipment whose details are open in the pop-up, if any.
  const selected = shipments.find((shipment) => shipment.id === openId);

  // The one date on a closed bar: the one the customer cares about most
  // for that shipment.
  function barDate(shipment) {
    const say = (key, date) =>
      `${t(`profile.shipments.bar.${key}`)} ${shortDay.format(date)}`;
    if (shipment.delivered_at)
      return say('delivered', new Date(shipment.delivered_at));
    if (shipment.status === 'cancelled') return null;
    // Already on the island: an expected date would be in the past.
    if (shipment.status === 'arrived' && shipment.shipped_at)
      return say('shipped', new Date(shipment.shipped_at));
    if (shipment.estimated_arrival) {
      const [y, m, d] = shipment.estimated_arrival.split('-').map(Number);
      return say('expected', new Date(y, m - 1, d));
    }
    if (shipment.shipped_at)
      return say('shipped', new Date(shipment.shipped_at));
    return say('registered', new Date(shipment.created_at));
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
            {/* The heading is the button that folds the group open and
                closed; the arrow points down when it is open. */}
            <h3 className={styles.shipmentGroupTitle}>
              <button
                type="button"
                className={styles.shipmentGroupToggle}
                aria-expanded={openGroups.has(group.id)}
                aria-controls={`${idBase}-${group.id}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span className={styles.shipmentGroupIcon}>
                  <group.Icon size={16} />
                </span>
                {t(`profile.shipments.groups.${group.id}`)}
                <span className={styles.shipmentGroupCount}>
                  {inGroup.length}
                </span>
                <ChevronRightIcon
                  size={20}
                  className={styles.shipmentGroupChevron}
                />
              </button>
            </h3>

            {openGroups.has(group.id) && (
              <ul className={styles.shipmentList} id={`${idBase}-${group.id}`}>
                {inGroup.map((shipment) => {
                  const when = barDate(shipment);

                  return (
                    <li key={shipment.id} className={styles.shipment}>
                      {/* The bar. The whole bar is the button that opens the
                        details in a pop-up window. */}
                      <button
                        type="button"
                        className={styles.shipmentBar}
                        aria-haspopup="dialog"
                        onClick={() => setOpenId(shipment.id)}
                      >
                        <span className={styles.shipmentBarMain}>
                          <span className={styles.invoiceNumber}>
                            {shipment.tracking_number}
                          </span>
                          {shipment.description && (
                            <span className={styles.shipmentBarText}>
                              {shipment.description}
                            </span>
                          )}
                        </span>
                        <span className={styles.shipmentBarSide}>
                          <span className={styles.shipmentStatus}>
                            {statusLabel(shipment)}
                          </span>
                          {when && (
                            <span className={styles.shipmentBarWhen}>
                              {when}
                            </span>
                          )}
                        </span>
                        <ChevronRightIcon
                          size={20}
                          className={styles.shipmentChevron}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {/* The details of the clicked shipment, in a pop-up window over the
          page. Closes with its button, the x, Escape or a click outside. */}
      {selected && (
        <HelpDialog
          open
          wide
          onClose={() => setOpenId(null)}
          title={`${t('profile.shipments.details.order')} ${selected.tracking_number}`}
          closeLabel={t('profile.shipments.details.close')}
          doneLabel={t('profile.shipments.details.close')}
        >
          {/* Inside the group's colours (see .shipmentGroup in the CSS),
              so the pop-up matches the bar that was clicked. */}
          <div className={styles.shipmentGroup} data-group={groupOf(selected)}>
            <div className={styles.shipmentPopupHead}>
              {selected.description && (
                <p className={styles.shipmentBarText}>{selected.description}</p>
              )}
              <span className={styles.shipmentStatus}>
                {statusLabel(selected)}
              </span>
            </div>
            <ShipmentDetails
              shipment={selected}
              invoices={invoices}
              dateFormat={dateFormat}
              lock={lockText(selected)}
            />
          </div>
        </HelpDialog>
      )}
    </>
  );
}
