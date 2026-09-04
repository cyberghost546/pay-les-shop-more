// src/pages/Dashboard/Overview.jsx
import { Link, useOutletContext } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import ActivityChart from './ActivityChart';
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

/**
 * One number and the link to the list behind it.
 *
 * `urgent` is for counts that mean somebody has to act — those get the amber
 * treatment, so a glance at the row shows what is waiting rather than just
 * how big the business is.
 */
function Stat({ label, value, note, to, urgent = false }) {
  return (
    <Link
      to={to}
      className={urgent ? `${styles.stat} ${styles.statUrgent}` : styles.stat}
    >
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
      {note && <p className={styles.statNote}>{note}</p>}
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

  if (state === 'loading') return <Loading />;
  if (state === 'error' || !overview) return <ConnectionError onRetry={reload} />;

  const { quotes, messages, packages, customers, daily, ranges } = overview;
  const window = RANGE_LABELS[days]?.toLowerCase() ?? `last ${days} days`;

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Dashboard</h1>

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

      <ActivityChart daily={daily} />

      <div className={styles.statGrid}>
        <Stat
          label="New quote requests"
          value={quotes.new}
          note={`${quotes.recent} in the ${window}`}
          to="/dashboard/quotes?status=new"
          urgent={quotes.new > 0}
        />
        <Stat
          label="Unread messages"
          value={messages.unhandled}
          note={`${messages.recent} in the ${window}`}
          to="/dashboard/messages?handled=false"
          urgent={messages.unhandled > 0}
        />
        <Stat
          label="Packages in transit"
          value={packages.in_transit}
          note={`${packages.awaiting_action} not yet shipped`}
          to="/dashboard/packages?status=in_transit"
        />
        <Stat
          label="Customers"
          value={customers.total}
          note={`${customers.recent} joined in the ${window}`}
          to="/dashboard/customers"
        />
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
