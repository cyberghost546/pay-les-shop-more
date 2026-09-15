// src/pages/Dashboard/Overview.jsx
//
// The office's home page, top to bottom in the order it gets read:
//
//   1. What needs a person now - the work queues, each one tap from its list.
//   2. Where the business stands - headline numbers and how they moved.
//   3. The shape of the period - the activity chart - beside a live look at
//      the warehouse floor.
//   4. The latest packages, quote requests and messages.

import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiUrl } from '../../api/client';
import { getWarehouseBoard } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import ActivityChart from './ActivityChart';
import { Donut } from './gauges';
import { StatusBadge } from './ui';
import { PACKAGE_TONES, QUOTE_TONES } from './statuses';
import { formatDate, formatMoney, formatWeight } from './format';
import styles from './Dashboard.module.css';

// The date line follows the dashboard language.
const DATE_LOCALES = { nl: 'nl-NL', en: 'en-GB', pap: 'nl-CW' };

function greetingKey(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * The change from the previous period, or null when there is nothing honest
 * to say. A rise from zero is worded rather than given an infinite percentage.
 */
function change(trend, t) {
  if (!trend) return null;
  const { current, previous } = trend;
  if (current === previous) return { direction: 'flat', text: t('dashboard.office.overview.stats.noChange') };
  if (previous === 0) return { direction: 'up', text: fill(t('dashboard.office.overview.stats.fromNone'), { count: current }) };
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    direction: current > previous ? 'up' : 'down',
    text: `${percent > 0 ? '+' : ''}${percent}%`,
  };
}

const ARROWS = { up: '▲', down: '▼', flat: '–' };

/** One work queue: a count and where to go to clear it. Lit up when non-zero. */
function Queue({ name, count, to }) {
  const { t } = useLanguage();
  const busy = count > 0;
  const label = t(`dashboard.office.overview.queues.${name}.label`);
  const hint = t(`dashboard.office.overview.queues.${name}.hint`);
  return (
    <Link to={to} className={`${styles.queue} ${busy ? styles.queueBusy : ''}`}>
      <span className={styles.queueCount}>{count}</span>
      <span className={styles.queueText}>
        <span className={styles.queueLabel}>{label}</span>
        <span className={styles.queueHint}>{busy ? hint : t('dashboard.office.overview.allClear')}</span>
      </span>
      <span className={styles.queueArrow} aria-hidden="true">
        →
      </span>
    </Link>
  );
}

function Stat({ label, value, to, trend, note }) {
  const { t } = useLanguage();
  const moved = change(trend, t);
  return (
    <Link to={to} className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {moved ? (
        <span className={`${styles.statDelta} ${styles[`kpiDelta_${moved.direction}`]}`}>
          <span aria-hidden="true">{ARROWS[moved.direction]}</span> {moved.text}
          <span className={styles.statDeltaNote}> {t('dashboard.office.overview.stats.vsPrevious')}</span>
        </span>
      ) : (
        <span className={styles.statNote}>{note}</span>
      )}
    </Link>
  );
}

/** The warehouse floor at a glance, from the same API the warehouse reads. */
function WarehousePanel() {
  const { t } = useLanguage();
  const [board, setBoard] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    getWarehouseBoard()
      .then((data) => !cancelled && setBoard({ status: 'ready', data }))
      .catch(() => !cancelled && setBoard({ status: 'error', data: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const data = board.data;
  const rows = data
    ? [
        { label: t('dashboard.office.overview.warehouse.waitingMeasurement'), value: data.waiting_measurement ?? 0, to: '/warehouse/measurements' },
        { label: t('dashboard.office.overview.warehouse.waitingPackaging'), value: data.waiting_packaging ?? 0, to: '/warehouse/packaging' },
        { label: t('dashboard.office.overview.warehouse.ready'), value: data.ready_for_shipment ?? 0, to: '/warehouse/packages?stage=ready' },
        { label: t('dashboard.office.overview.warehouse.damaged'), value: data.damaged ?? 0, to: '/warehouse/damage', alert: true },
        { label: t('dashboard.office.overview.warehouse.attention'), value: data.attention ?? 0, to: '/warehouse/packages?attention=true', alert: true },
      ]
    : [];

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{t('dashboard.office.overview.warehouse.title')}</h2>
        <Link to="/warehouse" className={styles.sectionLink}>
          {t('dashboard.office.overview.warehouse.open')}
        </Link>
      </div>

      {board.status === 'loading' && <p className={styles.feedMeta}>{t('dashboard.office.overview.warehouse.loading')}</p>}
      {board.status === 'error' && <p className={styles.feedMeta}>{t('dashboard.office.overview.warehouse.error')}</p>}

      {data && (
        <>
          <p className={styles.panelLead}>
            <strong>{data.measured_today ?? 0}</strong> {t('dashboard.office.overview.warehouse.measuredToday')}
          </p>
          <ul className={styles.panelList}>
            {rows.map((row) => (
              <li key={row.label}>
                <Link
                  to={row.to}
                  className={`${styles.panelRow} ${row.alert && row.value > 0 ? styles.panelRowAlert : ''}`}
                >
                  <span>{row.label}</span>
                  <span className={styles.panelValue}>{row.value}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* A plain link: same origin, so the session cookie goes with it
              and the browser saves the file itself. */}
          <p className={styles.panelFoot}>
            <a className={styles.sectionLink} href={apiUrl('/staff/warehouse/report/?export=csv')}>
              {t('dashboard.office.overview.warehouse.report')}
            </a>
          </p>
        </>
      )}
    </section>
  );
}

/** The chart's numbers as a CSV file, saved by the browser. */
function exportCsv(daily) {
  const header = 'date,quotes,packages,messages';
  const rows = daily.map((row) => `${row.date},${row.quotes},${row.packages},${row.messages}`);
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-${daily[0]?.date}-to-${daily.at(-1)?.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Overview() {
  const { overview, state, reload, days, setDays } = useOutletContext();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const rangeLabel = (value) => fill(t('dashboard.office.overview.rangeDays'), { days: value });

  if (state === 'loading' && !overview) return <Loading />;
  if (!overview) return <ConnectionError onRetry={reload} />;

  const { quotes, messages, packages, customers, daily, ranges } = overview;
  const invoices = overview.invoices ?? {};
  const bookings = overview.bookings ?? {};
  const documents = overview.documents ?? {};
  const awaitingPayment = packages.by_status?.quoted ?? 0;

  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'there';
  const today = new Intl.DateTimeFormat(DATE_LOCALES[language] ?? 'nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const waiting =
    (quotes.new ?? 0) +
    (messages.unhandled ?? 0) +
    (invoices.pending_review ?? 0) +
    (bookings.new ?? 0) +
    (documents.unattached ?? 0);

  return (
    <>
      <div className={styles.hero}>
        <div>
          <p className={styles.heroDate}>{today}</p>
          <h1 className={styles.heroTitle}>
            {t(`dashboard.office.overview.greeting.${greetingKey(new Date().getHours())}`)}, {firstName}
          </h1>
          <p className={styles.heroLead}>
            {waiting === 0
              ? t('dashboard.office.overview.nothingWaiting')
              : waiting === 1
                ? t('dashboard.office.overview.waitingOne')
                : fill(t('dashboard.office.overview.waitingMany'), { count: waiting })}
          </p>
        </div>

        <div className={styles.pageActions}>
          <label className={styles.rangePicker}>
            <span className={styles.srOnly}>{t('dashboard.office.overview.dateRange')}</span>
            <select
              className={styles.rangeSelect}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {(ranges ?? [7, 30, 90]).map((value) => (
                <option key={value} value={value}>
                  {rangeLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.action} onClick={() => exportCsv(daily)}>
            {t('dashboard.office.overview.exportCsv')}
          </button>
        </div>
      </div>

      {/* 1. The work queues */}
      <section className={styles.section} aria-labelledby="queues-heading">
        <h2 id="queues-heading" className={styles.overlineHeading}>
          {t('dashboard.office.overview.needsAttention')}
        </h2>
        <div className={styles.queues}>
          <Queue name="quotes" count={quotes.new ?? 0} to="/dashboard/quotes?status=new" />
          <Queue name="bookings" count={bookings.new ?? 0} to="/dashboard/bookings?status=new" />
          <Queue name="messages" count={messages.unhandled ?? 0} to="/dashboard/messages?handled=false" />
          <Queue name="invoices" count={invoices.pending_review ?? 0} to="/dashboard/invoices" />
          <Queue name="documents" count={documents.unattached ?? 0} to="/dashboard/documents?unattached=true" />
        </div>
      </section>

      {/* 2. Headline numbers */}
      <section className={styles.section} aria-labelledby="stats-heading">
        <h2 id="stats-heading" className={styles.overlineHeading}>
          {rangeLabel(days)}
        </h2>
        <div className={styles.stats}>
          <Stat label={t('dashboard.office.overview.stats.quotes')} value={quotes.recent ?? 0} to="/dashboard/quotes" trend={quotes.trend} />
          <Stat label={t('dashboard.office.overview.stats.packages')} value={packages.recent ?? 0} to="/dashboard/packages" trend={packages.trend} />
          <Stat
            label={t('dashboard.office.overview.stats.inTransit')}
            value={packages.in_transit ?? 0}
            to="/dashboard/packages?status=in_transit"
            note={fill(t('dashboard.office.overview.stats.awaitingPayment'), { count: awaitingPayment })}
          />
          <Stat label={t('dashboard.office.overview.stats.invoices')} value={invoices.recent ?? 0} to="/dashboard/invoices" trend={invoices.trend} />
          <Stat label={t('dashboard.office.overview.stats.customers')} value={customers.total ?? 0} to="/dashboard/customers" trend={customers.trend} />
        </div>
      </section>

      {/* 3. Chart and the warehouse */}
      <div className={styles.overviewRow}>
        <ActivityChart daily={daily} />

        <div className={styles.summaryColumn}>
          <WarehousePanel />
          <div className={styles.gaugeCard}>
            <Donut label={t('dashboard.office.overview.delivered')} value={packages.delivered ?? 0} total={packages.total ?? 0} />
            <Donut label={t('dashboard.office.overview.invoiced')} value={invoices.sent ?? 0} total={invoices.total ?? 0} colour="#0ea5e9" />
          </div>
        </div>
      </div>

      {/* 4. Latest */}
      <section className={`${styles.panel} ${styles.section}`}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('dashboard.office.overview.latestPackages')}</h2>
          <Link className={styles.sectionLink} to="/dashboard/packages">
            {t('dashboard.office.overview.seeAll')}
          </Link>
        </div>

        {overview.recent_packages.length === 0 ? (
          <p className={styles.feedMeta}>{t('dashboard.office.overview.noPackages')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.office.overview.table.tracking')}</th>
                  <th scope="col">{t('dashboard.office.overview.table.customer')}</th>
                  <th scope="col">{t('dashboard.office.overview.table.weightValue')}</th>
                  <th scope="col">{t('dashboard.office.overview.table.warehouse')}</th>
                  <th scope="col">{t('dashboard.office.overview.table.added')}</th>
                  <th scope="col">{t('dashboard.office.overview.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent_packages.map((pkg) => (
                  <tr key={pkg.id}>
                    <td className={styles.primaryCell}>
                      <Link className={styles.link} to={`/warehouse/packages/${pkg.id}`}>
                        {pkg.tracking_number}
                      </Link>
                      {pkg.description && (
                        <div className={`${styles.mutedCell} ${styles.excerpt}`}>{pkg.description}</div>
                      )}
                    </td>
                    <td>
                      <div>{pkg.customer?.name}</div>
                      <div className={styles.mutedCell}>{pkg.customer?.email}</div>
                    </td>
                    <td className={styles.numberCell}>
                      <div>{formatWeight(pkg.measurement?.weight_kg ?? pkg.weight_kg)}</div>
                      <div className={styles.mutedCell}>{formatMoney(pkg.value_eur)}</div>
                    </td>
                    <td className={styles.mutedCell}>{pkg.warehouse_stage_display ?? '—'}</td>
                    <td className={styles.dateCell}>{formatDate(pkg.created_at)}</td>
                    <td>
                      <StatusBadge tone={PACKAGE_TONES[pkg.status]}>{pkg.status_display}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{t('dashboard.office.overview.latestQuotes')}</h2>
            <Link className={styles.sectionLink} to="/dashboard/quotes">
              {t('dashboard.office.overview.seeAll')}
            </Link>
          </div>
          {overview.recent_quotes.length === 0 ? (
            <p className={styles.feedMeta}>{t('dashboard.office.overview.noQuotes')}</p>
          ) : (
            <ul className={styles.feed}>
              {overview.recent_quotes.map((quote) => (
                <li key={quote.id} className={styles.feedItem}>
                  <div className={styles.feedMain}>
                    <p className={styles.feedTitle}>{quote.full_name}</p>
                    <p className={styles.feedMeta}>{quote.destination}</p>
                  </div>
                  <div className={styles.feedAside}>
                    <StatusBadge tone={QUOTE_TONES[quote.status]}>{quote.status_display}</StatusBadge>
                    <div>{formatDate(quote.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{t('dashboard.office.overview.latestMessages')}</h2>
            <Link className={styles.sectionLink} to="/dashboard/messages">
              {t('dashboard.office.overview.seeAll')}
            </Link>
          </div>
          {overview.recent_messages.length === 0 ? (
            <p className={styles.feedMeta}>{t('dashboard.office.overview.noMessages')}</p>
          ) : (
            <ul className={styles.feed}>
              {overview.recent_messages.map((message) => (
                <li key={message.id} className={styles.feedItem}>
                  <div className={styles.feedMain}>
                    <p className={styles.feedTitle}>{message.subject}</p>
                    <p className={styles.feedMeta}>{message.name}</p>
                  </div>
                  <div className={styles.feedAside}>
                    <StatusBadge tone={message.handled ? 'done' : 'attention'}>
                      {message.handled ? t('dashboard.office.overview.handled') : t('dashboard.office.overview.new')}
                    </StatusBadge>
                    <div>{formatDate(message.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
