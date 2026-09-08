// src/pages/Dashboard/Overview.jsx
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import ActivityChart from './ActivityChart';
import { Donut, Sparkline } from './gauges';
import { StatusBadge } from './ui';
import { PACKAGE_TONES, QUOTE_TONES } from './statuses';
import { PACKAGE_STATUSES, QUOTE_STATUSES } from '../../api/staff';
import { formatDate, formatMoney, formatWeight } from './format';
import styles from './Dashboard.module.css';

const RANGE_LABELS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };

/**
 * "New 3 · Quote sent 1 · Accepted 0 · Declined 0"
 *
 * Driven by the choice list rather than by the keys the API happened to
 * return, so a status with nothing in it still shows as zero instead of
 * vanishing from the line.
 */
function breakdown(options, counts) {
  return options
    .map(({ value, label }) => `${label} ${counts[value] ?? 0}`)
    .join(' · ');
}

/** "Good morning" / "Good afternoon" / "Good evening", by the clock. */
function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The change from the period before, as a word and a direction.
 *
 * Returns null when there is nothing honest to say. A rise from nothing has no
 * percentage — dividing by a previous zero is infinity, which no dashboard
 * should print — so that case is worded rather than calculated, and a metric
 * with no `trend` from the API gets no arrow at all instead of a made-up one.
 */
function change(trend) {
  if (!trend) return null;

  const { current, previous } = trend;
  if (current === previous) return { direction: 'flat', text: 'No change' };

  if (previous === 0) {
    return {
      direction: 'up',
      text: `${current} where there were none`,
    };
  }

  const percent = Math.round(((current - previous) / previous) * 100);

  return {
    direction: current > previous ? 'up' : 'down',
    text: `${percent > 0 ? '+' : ''}${percent}% vs previous`,
  };
}

const ARROWS = { up: '▲', down: '▼', flat: '–' };

/**
 * One tile in the strip across the top: a label, the number, and how it has
 * moved. Borderless and side by side rather than four separate cards — the
 * strip is one sentence about the state of the business, and boxing each
 * number makes them read as four unrelated facts.
 *
 * `urgent` is for counts that mean somebody has to act, which is a different
 * thing from a count being large.
 */
function Kpi({ label, value, note, to, trend, urgent = false }) {
  const moved = change(trend);

  return (
    <Link to={to} className={urgent ? `${styles.kpi} ${styles.kpiUrgent}` : styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value}</p>

      {moved && (
        <p className={`${styles.kpiDelta} ${styles[`kpiDelta_${moved.direction}`]}`}>
          <span aria-hidden="true">{ARROWS[moved.direction]}</span> {moved.text}
        </p>
      )}
      {!moved && note && <p className={styles.kpiNote}>{note}</p>}
    </Link>
  );
}

/** The chart's numbers as a CSV file, saved by the browser. */
function exportCsv(daily) {
  const header = 'date,quotes,packages,messages';
  const rows = daily.map(
    (row) => `${row.date},${row.quotes},${row.packages},${row.messages}`,
  );
  // A Blob and an object URL, so nothing is uploaded anywhere to produce a
  // file the browser already has every byte of.
  const blob = new Blob([[header, ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-${daily[0]?.date}-to-${daily.at(-1)?.date}.csv`;
  link.click();
  // Released straight away; the download has already taken its own reference.
  URL.revokeObjectURL(url);
}

export default function Overview() {
  // Fetched by the layout, which needs the same numbers for its badges and
  // owns the range so that one request serves both.
  const { overview, state, reload, days, setDays } = useOutletContext();
  // Only for the greeting. Everything the page counts comes from the
  // overview request; this is whose screen it is.
  const { user } = useAuth();

  if (state === 'loading') return <Loading />;
  if (state === 'error' || !overview) return <ConnectionError onRetry={reload} />;

  const { quotes, messages, packages, customers, daily, ranges } = overview;
  const window = RANGE_LABELS[days]?.toLowerCase() ?? `last ${days} days`;

  // Falls back through the full name to the e-mail address, and then to a
  // plain hello — the greeting must not read "Good morning, undefined".
  const firstName =
    user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'there';

  // Older sessions and older deploys may not carry the invoice block yet, so
  // the page reads it defensively rather than crashing on a missing key.
  const invoices = overview.invoices ?? {};

  // Everything that is a person's turn to act, in one figure. The three
  // queues are the same ones the sidebar pills count.
  const waiting =
    (quotes.new ?? 0) + (messages.unhandled ?? 0) + (invoices.pending_review ?? 0);

  // One number per day for the sparkline: how much arrived that day, whatever
  // kind of thing it was.
  const arrivals = daily.map((row) => row.quotes + row.packages + row.messages);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            {greeting(new Date().getHours())},{' '}
            <strong className={styles.pageTitleName}>{firstName}</strong>
          </h1>
          <p className={styles.pageSubtitle}>
            What the {window} looks like, and what is waiting for you.
          </p>
        </div>

        <div className={styles.pageActions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => exportCsv(daily)}
          >
            Export CSV
          </button>

          <label className={styles.rangePicker}>
            <span className={styles.srOnly}>Date range</span>
            <select
              className={styles.rangeSelect}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {(ranges ?? [7, 30, 90]).map((value) => (
                <option key={value} value={value}>
                  {RANGE_LABELS[value] ?? `Last ${value} days`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* The strip: five numbers and which way each is moving, read left to
          right before anything else on the page. */}
      <div className={styles.kpiStrip}>
        <Kpi
          label="New quote requests"
          value={quotes.new}
          to="/dashboard/quotes?status=new"
          trend={quotes.trend}
          urgent={quotes.new > 0}
        />
        <Kpi
          label="Unread messages"
          value={messages.unhandled}
          to="/dashboard/messages?handled=false"
          trend={messages.trend}
          urgent={messages.unhandled > 0}
        />
        <Kpi
          label="Packages in transit"
          value={packages.in_transit}
          note={`${packages.awaiting_action} not yet shipped`}
          to="/dashboard/packages?status=in_transit"
          trend={packages.trend}
        />
        <Kpi
          label="Invoices to review"
          value={invoices.pending_review ?? 0}
          to="/dashboard/invoices"
          trend={invoices.trend}
          urgent={(invoices.pending_review ?? 0) > 0}
        />
        <Kpi
          label="Customers"
          value={customers.total}
          to="/dashboard/customers"
          trend={customers.trend}
        />
      </div>

      {/* Chart on the left, the summary column on the right — the chart is
          the shape of the period, the column is where it stands now. */}
      <div className={styles.overviewRow}>
        <ActivityChart daily={daily} />

        <div className={styles.summaryColumn}>
          <Link to="/dashboard/invoices" className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Waiting on you</p>
            <p className={styles.summaryValue}>{waiting}</p>
            <p className={styles.summaryNote}>
              {quotes.new} quotes · {messages.unhandled} messages ·{' '}
              {invoices.pending_review ?? 0} invoices
            </p>

            <div className={styles.summarySpark}>
              <Sparkline
                values={arrivals}
                label={`Everything that arrived each day over the ${window}`}
              />
            </div>
          </Link>

          <div className={styles.gaugeCard}>
            <Donut
              label="Delivered"
              value={packages.delivered ?? 0}
              total={packages.total ?? 0}
            />
            <Donut
              label="Invoiced"
              value={invoices.sent ?? 0}
              total={invoices.total ?? 0}
              colour="#0ea5e9"
            />
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Latest packages</h2>
          <Link className={styles.sectionLink} to="/dashboard/packages">
            See all →
          </Link>
        </div>

        {overview.recent_packages.length === 0 ? (
          <p className={styles.empty}>No packages yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Tracking</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Description</th>
                  <th scope="col">Weight / value</th>
                  <th scope="col">Added</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent_packages.map((pkg) => (
                  <tr key={pkg.id}>
                    <td className={styles.primaryCell}>{pkg.tracking_number}</td>
                    <td>
                      <div>{pkg.customer?.name}</div>
                      <div className={styles.mutedCell}>{pkg.customer?.email}</div>
                    </td>
                    <td className={styles.mutedCell}>
                      <div className={styles.excerpt}>{pkg.description || '—'}</div>
                    </td>
                    <td className={styles.numberCell}>
                      <div>{formatWeight(pkg.weight_kg)}</div>
                      <div className={styles.mutedCell}>
                        {formatMoney(pkg.value_eur)}
                      </div>
                    </td>
                    <td className={styles.dateCell}>{formatDate(pkg.created_at)}</td>
                    <td>
                      <StatusBadge tone={PACKAGE_TONES[pkg.status]}>
                        {pkg.status_display}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Latest quote requests</h2>

          {overview.recent_quotes.length === 0 ? (
            <p className={styles.feedMeta}>No quote requests yet.</p>
          ) : (
            <ul className={styles.feed}>
              {overview.recent_quotes.map((quote) => (
                <li key={quote.id} className={styles.feedItem}>
                  <div className={styles.feedMain}>
                    <p className={styles.feedTitle}>{quote.full_name}</p>
                    <p className={styles.feedMeta}>{quote.destination}</p>
                  </div>
                  <div className={styles.feedAside}>
                    <StatusBadge tone={QUOTE_TONES[quote.status]}>
                      {quote.status_display}
                    </StatusBadge>
                    <div>{formatDate(quote.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className={styles.feedFoot}>
            <Link className={styles.sectionLink} to="/dashboard/quotes">
              See all →
            </Link>
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Latest messages</h2>

          {overview.recent_messages.length === 0 ? (
            <p className={styles.feedMeta}>No messages yet.</p>
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
                      {message.handled ? 'Handled' : 'New'}
                    </StatusBadge>
                    <div>{formatDate(message.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className={styles.feedFoot}>
            <Link className={styles.sectionLink} to="/dashboard/messages">
              See all →
            </Link>
          </p>
        </section>
      </div>

      <p className={styles.breakdown}>
        {/* The detail behind the headline numbers, for anyone who wants it
            without opening three list pages. */}
        <span>Quotes: {breakdown(QUOTE_STATUSES, quotes.by_status)}</span>
        <span>Packages: {breakdown(PACKAGE_STATUSES, packages.by_status)}</span>
      </p>
    </>
  );
}
