// src/pages/Driver/DriverPage.jsx
//
// The driver's app, on a phone: the shipments that have arrived and are
// waiting to be handed over, and what this driver delivered today. Each card
// has the customer's phone and address one tap from a call or directions, and
// a Delivered button that asks who took it and, optionally, for a photo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDeliveries, markDelivered } from '../../api/driver';
import { useAuth } from '../../auth/useAuth';
import AccountMenu from '../../components/AccountMenu/AccountMenu';
import LanguageMenu from '../../components/LanguageSwitcher/LanguageMenu';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Driver.module.css';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.replace(/\n/g, ', '))}`;
}

function DeliverForm({ delivery, onDone, onCancel }) {
  const { t } = useLanguage();
  const [recipient, setRecipient] = useState(delivery.customer ?? '');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function submit(event) {
    event.preventDefault();
    if (!recipient.trim()) return;
    setBusy(true);
    setError('');
    try {
      const updated = await markDelivered(delivery.id, { recipientName: recipient.trim(), note: note.trim(), photo });
      onDone(updated, recipient.trim());
    } catch (caught) {
      const fields = caught?.fields ?? {};
      const first = [fields.detail, fields.recipient_name, fields.photo, fields.note].flat().find(Boolean);
      setError(typeof first === 'string' ? first : t('dashboard.driver.error'));
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3 className={styles.formTitle}>{t('dashboard.driver.confirmTitle')}</h3>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>{t('dashboard.driver.recipient')}</span>
        <input
          className={styles.input}
          value={recipient}
          maxLength={150}
          autoComplete="off"
          required
          onChange={(event) => setRecipient(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('dashboard.driver.note')}</span>
        <input
          className={styles.input}
          value={note}
          maxLength={500}
          placeholder={t('dashboard.driver.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className={styles.fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && file.size <= MAX_PHOTO_BYTES) setPhoto(file);
        }}
      />
      {photo ? (
        <div className={styles.photoRow}>
          <img src={preview} alt={t('dashboard.driver.photoAdded')} className={styles.photo} />
          <button type="button" className={styles.linkButton} onClick={() => setPhoto(null)}>
            {t('dashboard.driver.removePhoto')}
          </button>
        </div>
      ) : (
        <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>
          {t('dashboard.driver.photo')}
        </button>
      )}

      <div className={styles.formButtons}>
        <button type="submit" className={styles.primary} disabled={busy || !recipient.trim()}>
          {busy ? t('dashboard.driver.saving') : t('dashboard.driver.confirm')}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
          {t('dashboard.driver.cancel')}
        </button>
      </div>
    </form>
  );
}

function DeliveryCard({ delivery, delivering, onStart, onDone, onCancel }) {
  const { t, language } = useLanguage();
  const done = delivery.delivered;

  return (
    <li className={`${styles.card} ${done ? styles.cardDone : ''}`}>
      <div className={styles.cardHead}>
        <span className={styles.tracking}>{delivery.tracking_number}</span>
        {delivery.estimated_arrival && !done && (
          <span className={styles.eta}>
            {fill(t('dashboard.driver.eta'), {
              date: new Date(delivery.estimated_arrival).toLocaleDateString(language === 'en' ? 'en-GB' : 'nl-NL'),
            })}
          </span>
        )}
      </div>

      <p className={styles.customer}>{delivery.customer}</p>
      {delivery.delivery_address_text && <p className={styles.address}>{delivery.delivery_address_text}</p>}

      {done ? (
        <p className={styles.doneLine}>
          ✓ {fill(t('dashboard.driver.takenBy'), { name: done.recipient_name, time: done.time })}
        </p>
      ) : delivering ? (
        <DeliverForm delivery={delivery} onDone={onDone} onCancel={onCancel} />
      ) : (
        <div className={styles.actions}>
          {delivery.customer_phone && (
            <a className={styles.secondary} href={`tel:${delivery.customer_phone.replace(/[^\d+]/g, '')}`}>
              {t('dashboard.driver.call')}
            </a>
          )}
          {delivery.delivery_address_text && (
            <a className={styles.secondary} href={mapsLink(delivery.delivery_address_text)} target="_blank" rel="noreferrer">
              {t('dashboard.driver.route')}
            </a>
          )}
          <button type="button" className={styles.primary} onClick={onStart}>
            {t('dashboard.driver.delivered')}
          </button>
        </div>
      )}
    </li>
  );
}

export default function DriverPage() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [view, setView] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ key: null, status: 'loading', rows: [] });
  const [delivering, setDelivering] = useState(null);
  const [message, setMessage] = useState('');
  const key = `${view}|${search}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      listDeliveries({ view, search })
        .then((rows) => !cancelled && setAnswer({ key, status: 'ready', rows }))
        .catch(() => !cancelled && setAnswer({ key, status: 'error', rows: [] }));
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, view, search]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state = answer.key === key ? answer.status : 'loading';

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  function handleDone(updated, name) {
    setDelivering(null);
    setMessage(fill(t('dashboard.driver.success'), { tracking: updated.tracking_number, name }));
    // Off the "to deliver" list straight away; the list refetches behind it.
    setAnswer((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== updated.id) }));
    reload();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            P
          </span>
          <span className={styles.brandText}>
            PayLesShopMore
            <span className={styles.brandTag}>{t('dashboard.driver.tag')}</span>
          </span>
        </span>
        <div className={styles.topRight}>
          <LanguageMenu />
          <AccountMenu
            links={user?.isStaff ? [{ to: '/dashboard', label: t('dashboard.driver.office') }] : []}
            signOutLabel={t('dashboard.driver.signOut')}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{t('dashboard.driver.title')}</h1>
        <p className={styles.lead}>{t('dashboard.driver.lead')}</p>

        <div className={styles.tabs} role="tablist">
          {[
            ['', t('dashboard.driver.toDeliver')],
            ['today', t('dashboard.driver.today')],
          ].map(([value, label]) => (
            <button
              key={value || 'waiting'}
              type="button"
              role="tab"
              aria-selected={view === value}
              className={`${styles.tab} ${view === value ? styles.tabOn : ''}`}
              onClick={() => {
                setView(value);
                setDelivering(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="search"
          className={styles.search}
          value={search}
          placeholder={t('dashboard.driver.search')}
          aria-label={t('dashboard.driver.search')}
          onChange={(event) => setSearch(event.target.value)}
        />

        {message && (
          <p className={styles.success} role="status">
            {message}
          </p>
        )}

        {state === 'loading' && <Loading inline />}
        {state === 'error' && (
          <p className={styles.error} role="alert">
            {t('dashboard.driver.loadError')}{' '}
            <button type="button" className={styles.linkButton} onClick={reload}>
              {t('dashboard.driver.retry')}
            </button>
          </p>
        )}
        {state === 'ready' &&
          (answer.rows.length === 0 ? (
            <p className={styles.empty}>
              {view === 'today' ? t('dashboard.driver.emptyToday') : t('dashboard.driver.empty')}
            </p>
          ) : (
            <ul className={styles.list}>
              {answer.rows.map((delivery) => (
                <DeliveryCard
                  key={delivery.id}
                  delivery={delivery}
                  delivering={delivering === delivery.id}
                  onStart={() => {
                    setMessage('');
                    setDelivering(delivery.id);
                  }}
                  onDone={handleDone}
                  onCancel={() => setDelivering(null)}
                />
              ))}
            </ul>
          ))}
      </main>
    </div>
  );
}
