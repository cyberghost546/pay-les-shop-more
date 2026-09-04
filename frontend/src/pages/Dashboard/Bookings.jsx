// src/pages/Dashboard/Bookings.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { BOOKING_STATUSES, listBookings, updateBooking } from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDate, formatMoney } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  StatusSelect,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

const TONES = {
  new: 'attention',
  confirmed: 'progress',
  booked_in: 'progress',
  shipped: 'done',
  cancelled: 'off',
};

const PACKING_QUALITY = [
  { value: '', label: 'Not checked' },
  { value: 'good', label: 'Goed' },
  { value: 'poor', label: 'Niet goed' },
];

/**
 * The office half of a booking form: the four things staff fill in at the
 * counter. What the sender declared is shown beside it and is not editable —
 * the value especially, which customs charges duty on.
 */
function OfficeFields({ booking, onSave, busy }) {
  const [draft, setDraft] = useState({
    shipping_number: booking.shipping_number ?? '',
    volume_m3: booking.volume_m3 ?? '',
    weight_kg: booking.weight_kg ?? '',
    packing_quality: booking.packing_quality ?? '',
  });

  const dirty = Object.entries(draft).some(
    ([field, value]) => String(booking[field] ?? '') !== String(value),
  );

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className={styles.officeBox}>
      <p className={styles.officeHead}>Office</p>

      <div className={styles.officeGrid}>
        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Shipping no.</span>
          <input
            className={styles.officeInput}
            value={draft.shipping_number}
            onChange={(event) => set('shipping_number', event.target.value)}
            placeholder="CI-0000"
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Volume m³</span>
          <input
            className={styles.officeInput}
            type="number"
            step="0.001"
            min="0"
            value={draft.volume_m3}
            onChange={(event) => set('volume_m3', event.target.value)}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Weight kg</span>
          <input
            className={styles.officeInput}
            type="number"
            step="0.01"
            min="0"
            value={draft.weight_kg}
            onChange={(event) => set('weight_kg', event.target.value)}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Packing</span>
          <select
            className={styles.officeInput}
            value={draft.packing_quality}
            onChange={(event) => set('packing_quality', event.target.value)}
          >
            {PACKING_QUALITY.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        className={styles.rowButton}
        disabled={!dirty || busy}
        onClick={() =>
          onSave({
            ...draft,
            // Empty means "not measured yet", which is null rather than 0.
            volume_m3: draft.volume_m3 === '' ? null : draft.volume_m3,
            weight_kg: draft.weight_kg === '' ? null : draft.weight_kg,
          })
        }
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function Bookings() {
  const [params] = useSearchParams();

  const list = useCollection(
    listBookings,
    { status: params.get('status') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  async function save(booking, changes) {
    setSavingId(booking.id);
    setError('');

    try {
      list.replaceRow(await updateBooking(booking.id, changes));
    } catch {
      setError('That change could not be saved. Check the connection and try again.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Bookings</h1>
        <p className={styles.subtitle}>
          Booking forms submitted from the website. What the sender declared is
          read-only; the shipping number, volume, weight and packing check are
          yours to fill in.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search bookings"
          placeholder="Search by shipping number, sender, recipient or contents"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={BOOKING_STATUSES}
          allLabel="Any status"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No bookings match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Sender</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Consignment</th>
                  <th scope="col">Received</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((booking) => (
                  <tr
                    key={booking.id}
                    className={booking.status === 'new' ? styles.rowUnhandled : undefined}
                  >
                    <td>
                      <div className={styles.primaryCell}>
                        {booking.shipping_number || `#${booking.id}`}
                      </div>
                      <div className={styles.mutedCell}>
                        {booking.freight_display} · {booking.destination_label}
                      </div>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() =>
                          setOpenId(openId === booking.id ? null : booking.id)
                        }
                      >
                        {openId === booking.id ? 'Hide details' : 'Details'}
                      </button>
                    </td>

                    <td>
                      <div>{booking.sender_name}</div>
                      <div className={styles.mutedCell}>
                        <a className={styles.link} href={`mailto:${booking.sender_email}`}>
                          {booking.sender_email}
                        </a>
                      </div>
                      <div className={styles.mutedCell}>{booking.sender_phone}</div>
                    </td>

                    <td>
                      <div>{booking.recipient_name}</div>
                      <div className={styles.mutedCell}>
                        {booking.recipient_address}, {booking.recipient_city}
                      </div>
                      <div className={styles.mutedCell}>{booking.recipient_phone}</div>
                    </td>

                    <td className={styles.numberCell}>
                      <div>
                        {booking.quantity} {booking.unit_display}
                      </div>
                      <div className={styles.mutedCell}>
                        {formatMoney(booking.value_eur)} declared
                      </div>
                      {booking.insured && (
                        <div className={styles.mutedCell}>
                          Insured {formatMoney(booking.insured_value_eur)}
                        </div>
                      )}
                    </td>

                    <td className={styles.dateCell}>{formatDate(booking.created_at)}</td>

                    <td>
                      <StatusSelect
                        label={`Status for booking ${booking.id}`}
                        value={booking.status}
                        options={BOOKING_STATUSES}
                        busy={savingId === booking.id}
                        onChange={(status) => save(booking, { status })}
                      />
                      <div style={{ marginTop: '0.35rem' }}>
                        <StatusBadge tone={TONES[booking.status]}>
                          {booking.status_display}
                        </StatusBadge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* The expanded booking, below the table rather than inside it: a form
          crammed into a table cell is unusable, and this form has the whole
          paper sheet behind it. */}
      {openId !== null &&
        list.rows
          .filter((booking) => booking.id === openId)
          .map((booking) => (
            <section key={booking.id} className={styles.detail}>
              <h2 className={styles.detailTitle}>
                {booking.shipping_number || `Booking #${booking.id}`}
              </h2>

              <OfficeFields
                booking={booking}
                busy={savingId === booking.id}
                onSave={(changes) => save(booking, changes)}
              />

              <dl className={styles.detailGrid}>
                <div>
                  <dt>Sender address</dt>
                  <dd>
                    {booking.sender_address}
                    <br />
                    {booking.sender_postal_code} {booking.sender_city}
                  </dd>
                </div>
                <div>
                  <dt>Packing / payment</dt>
                  <dd>
                    {booking.packing_display} · {booking.payment_display}
                  </dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>{booking.vehicle_display}</dd>
                </div>
                <div>
                  <dt>Emigration</dt>
                  <dd>
                    {booking.emigration
                      ? [
                          booking.id_present && 'ID',
                          booking.deregistered && 'deregistered',
                          booking.deregistration_present && 'proof present',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'yes'
                      : 'No'}
                  </dd>
                </div>
                <div className={styles.detailWide}>
                  <dt>Contents</dt>
                  <dd>
                    {booking.contents || '—'}
                    {booking.contents_attached && (
                      <em> (packing list sent separately)</em>
                    )}
                  </dd>
                </div>
                {booking.notes && (
                  <div className={styles.detailWide}>
                    <dt>Sender&apos;s remarks</dt>
                    <dd>{booking.notes}</dd>
                  </div>
                )}
                <div className={styles.detailWide}>
                  <dt>Signed</dt>
                  <dd>
                    <span className={styles.signed}>{booking.signature_name}</span>
                    {' — '}
                    {formatDate(booking.signed_at)}
                    {booking.agreed_terms && ', terms accepted'}
                  </dd>
                </div>
              </dl>
            </section>
          ))}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
