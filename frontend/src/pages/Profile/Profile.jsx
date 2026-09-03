// src/pages/Profile/Profile.jsx
import { useEffect, useState } from 'react';
import {
  USING_PLACEHOLDER_DATA,
  changePassword,
  deleteAccount,
  getProfile,
  saveDefaultAddress,
  updateNotifications,
  updateProfile,
} from '../../api/profile';
import { AUTH_ERRORS } from '../../api/auth';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// Destinations we ship to. Values are ISO codes so the server never has to
// parse a display name.
const COUNTRIES = [
  { code: 'CW', label: 'Curaçao' },
  { code: 'BQ', label: 'Bonaire' },
  { code: 'AW', label: 'Aruba' },
  { code: 'SX', label: 'Sint Maarten' },
  { code: 'NL', label: 'Nederland' },
];

const NOTIFICATION_KEYS = ['shipping', 'offers', 'newsletter'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 12;

const EMPTY_PASSWORDS = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

// Both validators return translation keys, so an error on screen follows the
// visitor when they switch language.
function validateDetails({ name, email }) {
  const errors = {};

  if (!name.trim()) errors.name = 'profile.errors.nameRequired';

  if (!email.trim()) errors.email = 'profile.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'profile.errors.emailInvalid';

  return errors;
}

function validatePasswords({ currentPassword, newPassword, confirmPassword }) {
  const errors = {};

  if (!currentPassword) errors.currentPassword = 'profile.errors.currentRequired';

  if (newPassword.length < MIN_PASSWORD_LENGTH)
    errors.newPassword = 'profile.errors.passwordShort';

  if (newPassword !== confirmPassword)
    errors.confirmPassword = 'profile.errors.confirmMismatch';

  return errors;
}

const FAILURE_KEYS = {
  [AUTH_ERRORS.NOT_IMPLEMENTED]: 'profile.notImplemented',
  [AUTH_ERRORS.VALIDATION]: 'profile.errors.currentRequired',
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'profile.errors.currentRequired',
  [AUTH_ERRORS.UNAVAILABLE]: 'profile.errors.offline',
  [AUTH_ERRORS.UNAUTHENTICATED]: 'profile.errors.offline',
};

// Initials for the avatar circle: "Voorbeeld Klant" becomes "VK".
function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function Profile() {
  const { t, language } = useLanguage();

  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState(null);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [notifications, setNotifications] = useState(null);

  const [detailErrors, setDetailErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});

  // One status slot per section, so saving the address does not clear a
  // message sitting above the password form.
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  // null | 'deleted' | 'anonymised' — set once the account is gone.
  const [deleted, setDeleted] = useState(null);

  // 'loading' | 'ready' | 'error'. Bumping `attempt` re-runs the fetch, which
  // is what the retry button does.
  const [loadState, setLoadState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getProfile()
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setDetails(loaded);
        setNotifications(loaded.notifications);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
      });

    return () => {
      // Stops a slow response from overwriting state after the visitor has
      // navigated away, or after a retry has already superseded it.
      cancelled = true;
    };
  }, [attempt]);

  // Back to the spinner, then bump `attempt` to re-run the effect above.
  function retry() {
    setLoadState('loading');
    setAttempt((n) => n + 1);
  }

  if (loadState === 'error') {
    return (
      <main className={styles.page}>
        <ConnectionError onRetry={retry} />
      </main>
    );
  }

  if (loadState === 'loading' || !details) {
    return (
      <main className={styles.page}>
        <Loading />
      </main>
    );
  }

  function setSectionStatus(section, value) {
    setStatus((current) => ({ ...current, [section]: value }));
  }

  function handleDetailChange(event) {
    const { name, value } = event.target;
    setDetails((current) => ({ ...current, [name]: value }));
    setDetailErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswords((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  // Shared shape for all four save handlers: run the call, report honestly.
  async function runSave(section, call, onSuccess) {
    setBusy((current) => ({ ...current, [section]: true }));
    setSectionStatus(section, null);

    try {
      await call();
      setSectionStatus(section, { ok: true, key: 'profile.saved' });
      onSuccess?.();
    } catch (error) {
      setSectionStatus(section, {
        ok: false,
        key: FAILURE_KEYS[error.code] ?? 'profile.errors.offline',
      });
    } finally {
      setBusy((current) => ({ ...current, [section]: false }));
    }
  }

  function handleDetailsSubmit(event) {
    event.preventDefault();
    const found = validateDetails(details);
    setDetailErrors(found);
    if (Object.keys(found).length > 0) return;

    runSave('details', () =>
      updateProfile({
        name: details.name.trim(),
        email: details.email.trim(),
        phone: details.phone.trim(),
      }),
    );
  }

  function handleAddressSubmit(event) {
    event.preventDefault();
    // Addresses live in their own table, so this does not go through the
    // profile endpoint. Remember the new id, so a second save patches rather
    // than creating a duplicate.
    runSave('address', async () => {
      const saved = await saveDefaultAddress({
        addressId: details.addressId,
        street: details.street.trim(),
        postalCode: details.postalCode.trim(),
        city: details.city.trim(),
        country: details.country,
      });
      setDetails((current) => ({ ...current, addressId: saved.id }));
    });
  }

  function handlePasswordSubmit(event) {
    event.preventDefault();
    const found = validatePasswords(passwords);
    setPasswordErrors(found);
    if (Object.keys(found).length > 0) return;

    runSave(
      'password',
      () =>
        changePassword({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      // Never leave passwords sitting in state after the request.
      () => setPasswords(EMPTY_PASSWORDS),
    );
  }

  function handleNotificationsSubmit(event) {
    event.preventDefault();
    runSave('notifications', () => updateNotifications({ notifications }));
  }

  function handleDelete(event) {
    event.preventDefault();

    // The server demands the password too; checking here saves a round trip
    // and gives the same message as the other forms.
    if (!deletePassword) {
      setSectionStatus('danger', {
        ok: false,
        key: 'profile.errors.currentRequired',
      });
      return;
    }

    runSave(
      'danger',
      async () => {
        const result = await deleteAccount({ currentPassword: deletePassword });
        // Shipment records may have to be kept; say which happened rather
        // than claiming everything is gone.
        setDeleted(result?.anonymised ? 'anonymised' : 'deleted');
      },
      () => {
        setDeletePassword('');
        setConfirmingDelete(false);
      },
    );
  }

  const memberSince = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.memberSince));

  // Rendered under every form; null when that section has nothing to report.
  function statusFor(section) {
    const value = status[section];
    if (!value) return null;

    return (
      <p
        className={value.ok ? styles.ok : styles.failure}
        role={value.ok ? 'status' : 'alert'}
      >
        {t(value.key)}
      </p>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('profile.title')}</h1>
        <p className={styles.subtitle}>{t('profile.subtitle')}</p>
      </header>

      {/* Removed automatically once profile.js talks to a real server */}
      {USING_PLACEHOLDER_DATA && (
        <p className={styles.notice} role="status">
          {t('profile.demoNotice')}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.summary}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(details.name)}
          </span>
          <p className={styles.summaryName}>{details.name}</p>
          <p className={styles.summaryEmail}>{details.email}</p>
          <p className={styles.summaryMeta}>
            {t('profile.memberSince')} {memberSince}
          </p>
        </aside>

        <div className={styles.sections}>
          {/* Personal details */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.sections.details')}</h2>

            <form className={styles.form} onSubmit={handleDetailsSubmit} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>{t('profile.fields.name')}</span>
                <input
                  className={styles.input}
                  type="text"
                  name="name"
                  value={details.name}
                  onChange={handleDetailChange}
                  autoComplete="name"
                  aria-invalid={Boolean(detailErrors.name)}
                />
                {detailErrors.name && (
                  <span className={styles.error}>{t(detailErrors.name)}</span>
                )}
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.email')}</span>
                  <input
                    className={styles.input}
                    type="email"
                    name="email"
                    value={details.email}
                    onChange={handleDetailChange}
                    autoComplete="email"
                    aria-invalid={Boolean(detailErrors.email)}
                  />
                  {detailErrors.email && (
                    <span className={styles.error}>{t(detailErrors.email)}</span>
                  )}
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.phone')}</span>
                  <input
                    className={styles.input}
                    type="tel"
                    name="phone"
                    value={details.phone}
                    onChange={handleDetailChange}
                    autoComplete="tel"
                  />
                </label>
              </div>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.details}
              >
                {busy.details ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('details')}
            </form>
          </section>

          {/* Delivery address */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.sections.address')}</h2>

            <form className={styles.form} onSubmit={handleAddressSubmit} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>{t('profile.fields.street')}</span>
                <input
                  className={styles.input}
                  type="text"
                  name="street"
                  value={details.street}
                  onChange={handleDetailChange}
                  autoComplete="street-address"
                />
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.fields.postalCode')}
                  </span>
                  <input
                    className={styles.input}
                    type="text"
                    name="postalCode"
                    value={details.postalCode}
                    onChange={handleDetailChange}
                    autoComplete="postal-code"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.city')}</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="city"
                    value={details.city}
                    onChange={handleDetailChange}
                    autoComplete="address-level2"
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>{t('profile.fields.country')}</span>
                <select
                  className={styles.input}
                  name="country"
                  value={details.country}
                  onChange={handleDetailChange}
                  autoComplete="country"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.address}
              >
                {busy.address ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('address')}
            </form>
          </section>

          {/* Change password */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.sections.password')}</h2>

            <form
              className={styles.form}
              onSubmit={handlePasswordSubmit}
              noValidate
            >
              <label className={styles.field}>
                <span className={styles.label}>
                  {t('profile.fields.currentPassword')}
                </span>
                <input
                  className={styles.input}
                  type="password"
                  name="currentPassword"
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  autoComplete="current-password"
                  aria-invalid={Boolean(passwordErrors.currentPassword)}
                />
                {passwordErrors.currentPassword && (
                  <span className={styles.error}>
                    {t(passwordErrors.currentPassword)}
                  </span>
                )}
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.fields.newPassword')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    name="newPassword"
                    value={passwords.newPassword}
                    onChange={handlePasswordChange}
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordErrors.newPassword)}
                  />
                  {passwordErrors.newPassword && (
                    <span className={styles.error}>
                      {t(passwordErrors.newPassword)}
                    </span>
                  )}
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.fields.confirmPassword')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    name="confirmPassword"
                    value={passwords.confirmPassword}
                    onChange={handlePasswordChange}
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordErrors.confirmPassword)}
                  />
                  {passwordErrors.confirmPassword && (
                    <span className={styles.error}>
                      {t(passwordErrors.confirmPassword)}
                    </span>
                  )}
                </label>
              </div>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.password}
              >
                {busy.password ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('password')}
            </form>
          </section>

          {/* Notification preferences */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {t('profile.sections.notifications')}
            </h2>

            <form className={styles.form} onSubmit={handleNotificationsSubmit}>
              <ul className={styles.toggles}>
                {NOTIFICATION_KEYS.map((key) => (
                  <li key={key}>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={notifications[key]}
                        onChange={(event) =>
                          setNotifications((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      {t(`profile.notifications.${key}`)}
                    </label>
                  </li>
                ))}
              </ul>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.notifications}
              >
                {busy.notifications ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('notifications')}
            </form>
          </section>

          {/* Deleting is irreversible, so it is visually separated and needs a
              second, explicit confirmation. */}
          <section className={`${styles.card} ${styles.danger}`}>
            <h2 className={styles.cardTitle}>{t('profile.sections.danger')}</h2>
            <p className={styles.dangerText}>{t('profile.dangerText')}</p>

            {deleted ? (
              // The account is gone; there is nothing left to act on here.
              <p className={styles.ok} role="status">
                {deleted === 'anonymised'
                  ? t('profile.deleteAnonymised')
                  : t('profile.deleteDone')}
              </p>
            ) : confirmingDelete ? (
              <form className={styles.confirm} onSubmit={handleDelete}>
                <p className={styles.confirmText}>{t('profile.deleteConfirm')}</p>

                {/* The password is required by the server too. A destructive,
                    irreversible action should not ride on a session alone. */}
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.deletePasswordLabel')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      setDeletePassword('');
                      setConfirmingDelete(false);
                    }}
                  >
                    {t('profile.deleteCancel')}
                  </button>
                  <button
                    type="submit"
                    className={styles.deleteConfirmed}
                    disabled={busy.danger}
                  >
                    {t('profile.deleteYes')}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.delete}
                onClick={() => setConfirmingDelete(true)}
              >
                {t('profile.deleteAccount')}
              </button>
            )}

            {statusFor('danger')}
          </section>
        </div>
      </div>
    </main>
  );
}
