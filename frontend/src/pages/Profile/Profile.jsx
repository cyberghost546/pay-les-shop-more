// src/pages/Profile/Profile.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  USING_PLACEHOLDER_DATA,
  changePassword,
  deleteAccount,
  getProfile,
  updateNotifications,
  updateProfile,
} from '../../api/profile';
import { listInvoices } from '../../api/invoices';
import Receipts from './Receipts';
import Shipments from './Shipments';
import { AUTH_ERRORS } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';
import { sanitizePhone } from '../../utils/phone';

// Destinations we ship to. Values are ISO codes so the server never has to
// parse a display name.


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

// One per section, so a glance down the page tells the sections apart. Same
// family as the rest of the site: 24-box, no fill, 1.9 stroke, round caps.
function SectionIcon({ name }) {
  const paths = {
    details: (
      <>
        <circle cx="12" cy="8" r="3.8" />
        <path d="M4.5 20v-1.6A4.9 4.9 0 0 1 9.4 13.5h5.2a4.9 4.9 0 0 1 4.9 4.9V20" />
      </>
    ),
    address: (
      <>
        <path d="M12 2.5a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7Z" />
        <circle cx="12" cy="9.5" r="2.6" />
      </>
    ),
    shipments: (
      <>
        <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" />
        <path d="M3 8.5 12 13l9-4.5" />
        <path d="M12 13v7" />
      </>
    ),
    invoices: (
      <>
        <path d="M6 3h9l3.5 3.5V21H6Z" />
        <path d="M14.6 3v3.9h3.9" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),
    receipts: (
      <>
        <path d="M7 3.5h10v17l-2.5-1.6-2.5 1.6-2.5-1.6L7 20.5Z" />
        <path d="M10 8h4M10 12h4" />
      </>
    ),
    password: (
      <>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
        <path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3" />
        <circle cx="12" cy="15.5" r="1.2" />
      </>
    ),
    notifications: (
      <>
        <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
        <path d="M10 18.5a2 2 0 0 0 4 0" />
      </>
    ),
    danger: (
      <>
        <path d="M12 3.5 21 19H3Z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <svg
      className={styles.sectionIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// The order they appear in, for the side navigation.
const SECTIONS = [
  { id: 'details', labelKey: 'profile.sections.details' },
  { id: 'shipments', labelKey: 'profile.sections.shipments' },
  { id: 'invoices', labelKey: 'profile.sections.invoices' },
  { id: 'receipts', labelKey: 'profile.sections.receipts' },
  { id: 'password', labelKey: 'profile.sections.password' },
  { id: 'notifications', labelKey: 'profile.sections.notifications' },
  { id: 'danger', labelKey: 'profile.sections.danger' },
];

export default function Profile() {
  const { t, language } = useLanguage();
  // setUser, because the header, the booking form and the dashboard's
  // customer table all render from the copy <AuthProvider> holds. Saving here
  // has to republish it, or the header goes on greeting the old name.
  const { signOut, setUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState(null);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [notifications, setNotifications] = useState(null);

  // The invoices load on their own, separately from the profile above.
  // They are one card on a page of six, so a slow or failing invoice list
  // must not keep the visitor from changing their password.
  const [invoices, setInvoices] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [invoiceState, setInvoiceState] = useState('loading');

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

  useEffect(() => {
    let cancelled = false;

    // No setInvoiceState('loading') here: 'loading' is the initial value, and
    // a retry re-runs this effect from behind the page-level spinner, so the
    // card is not on screen to show a stale message in the meantime.
    listInvoices()
      .then((loaded) => {
        if (cancelled) return;
        setInvoices(loaded);
        setInvoiceState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // Reported inside the card rather than thrown at the page, for the
        // same reason it is fetched separately.
        setInvoiceState('error');
      });

    return () => {
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

    // Same rule as the signup form: the phone field refuses letters as they
    // are typed, rather than letting them through to the server.
    const sanitized = name === 'phone' ? sanitizePhone(value) : value;

    setDetails((current) => ({ ...current, [name]: sanitized }));
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

    runSave('details', async () => {
      const saved = await updateProfile({
        name: details.name.trim(),
        email: details.email.trim(),
        phone: details.phone.trim(),
      });

      setProfile(saved);
      // Only the identity fields: the address form below shares this state,
      // and an unsaved edit sitting in it should not be thrown away by a save
      // that was never about the address.
      setDetails((current) => ({
        ...current,
        name: saved.name,
        firstName: saved.firstName,
        lastName: saved.lastName,
        email: saved.email,
        phone: saved.phone,
      }));
      setUser(saved);
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

  const invoiceDate = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Euros, because that is what the API sends and what the document says.
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
  });

  async function handleSignOut() {
    setBusy((current) => ({ ...current, logout: true }));

    try {
      await signOut();
    } finally {
      // Home rather than staying put: this page needs an account, so the
      // route guard would bounce them to the login form the moment the
      // session went away.
      navigate('/', { replace: true });
    }
  }

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

      {/* Removed automatically once profile.js talks to a real server */}
      {USING_PLACEHOLDER_DATA && (
        <p className={styles.notice} role="status">
          {t('profile.demoNotice')}
        </p>
      )}

      {/* The identity leads the page rather than sitting in a sidebar: it is
          the answer to "whose account is this", which is the first thing
          anyone checks. */}
      <section className={styles.identity}>
        <div className={styles.identityInner}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(details.name)}
          </span>
          <div className={styles.identityText}>
            <h1 className={styles.identityName}>{details.name}</h1>
            <p className={styles.identityEmail}>{details.email}</p>
            <p className={styles.identityMeta}>
              {t('profile.memberSince')} {memberSince}
              {profile.isStaff && (
                <span className={styles.staffBadge}>Staff</span>
              )}
            </p>
          </div>

          <div className={styles.identityActions}>
            {/* Staff only. Like the header's link this is a shortcut, not a
                permission — the dashboard has its own guard and the staff API
                checks the flag again on every request. Untranslated, because
                the back office is English throughout. */}
            {profile.isStaff && (
              <Link to="/dashboard" className={styles.dashboardLink}>
                Dashboard
              </Link>
            )}
            <button
              type="button"
              className={styles.logout}
              onClick={handleSignOut}
              disabled={busy.logout}
            >
              {t('account.logout')}
            </button>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        {/* Five sections is enough that jumping beats scrolling. */}
        <nav className={styles.sideNav} aria-label={t('profile.title')}>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={
                section.id === 'danger'
                  ? `${styles.sideLink} ${styles.sideLinkDanger}`
                  : styles.sideLink
              }
            >
              <SectionIcon name={section.id} />
              {t(section.labelKey)}
            </a>
          ))}
        </nav>

        <div className={styles.sections}>
          {/* Personal details */}
          <section className={styles.card} id="details">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="details" />
              {t('profile.sections.details')}
            </h2>

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

          

          {/* Invoices. Read-only: an invoice is a record of what was
              charged, so there is nothing here to edit. */}
          {/* Every shipment on its own, in the order they happened. A
              customer whose first shipment has already gone has a second one
              for what they bought afterwards, and telling which things are on
              which boat is only possible if the two are never merged. */}
          <section className={styles.card} id="shipments">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="shipments" />
              {t('profile.sections.shipments')}
            </h2>

            <Shipments />
          </section>

          <section className={styles.card} id="invoices">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="invoices" />
              {t('profile.sections.invoices')}
            </h2>

            <p className={styles.cardIntro}>{t('profile.invoices.intro')}</p>

            {invoiceState === 'loading' && (
              <p className={styles.invoiceMessage} role="status">
                {t('profile.invoices.loading')}
              </p>
            )}

            {invoiceState === 'error' && (
              <p className={styles.failure} role="alert">
                {t('profile.invoices.failed')}{' '}
                <button type="button" className={styles.linkButton} onClick={retry}>
                  {t('profile.invoices.retry')}
                </button>
              </p>
            )}

            {invoiceState === 'ready' && invoices.length === 0 && (
              <p className={styles.invoiceMessage}>{t('profile.invoices.empty')}</p>
            )}

            {invoiceState === 'ready' && invoices.length > 0 && (
              <ul className={styles.invoiceList}>
                {invoices.map((invoice) => (
                  <li key={invoice.id} className={styles.invoice}>
                    <div className={styles.invoiceText}>
                      <p className={styles.invoiceNumber}>{invoice.number}</p>
                      <p className={styles.invoiceMeta}>
                        {/* The date on the document rather than the moment
                            it was e-mailed. Those are usually the same day
                            and occasionally are not, and the one the customer
                            can check against the PDF is this one. */}
                        {invoice.datedOn || invoice.sentAt
                          ? invoiceDate.format(
                              new Date(invoice.datedOn ?? invoice.sentAt),
                            )
                          : ''}
                        {(invoice.datedOn || invoice.sentAt) && ' · '}
                        {t('profile.invoices.tracking')} {invoice.trackingNumber}
                      </p>
                      {invoice.description && (
                        <p className={styles.invoiceMeta}>{invoice.description}</p>
                      )}
                    </div>

                    <div className={styles.invoiceRight}>
                      {invoice.valueEur != null && (
                        <span className={styles.invoiceAmount}>
                          {money.format(Number(invoice.valueEur))}
                        </span>
                      )}
                      {/* A plain link, not a fetch: the session cookie rides
                          along on a normal navigation, and the browser's own
                          download handling beats rebuilding it with a blob.
                          The server sends Content-Disposition: attachment. */}
                      <a
                        className={styles.invoiceDownload}
                        href={invoice.downloadUrl}
                        download
                      >
                        {t('profile.invoices.download')}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* What the customer sends in: the receipt for what they bought,
              the shop's invoice, a customs form. The opposite direction to
              the invoices above. */}
          <section className={styles.card} id="receipts">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="receipts" />
              {t('profile.sections.receipts')}
            </h2>

            <Receipts />
          </section>

          {/* Change password */}
          <section className={styles.card} id="password">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="password" />
              {t('profile.sections.password')}
            </h2>

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
          <section className={styles.card} id="notifications">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="notifications" />
              {t('profile.sections.notifications')}
            </h2>

            <form className={styles.form} onSubmit={handleNotificationsSubmit}>
              <ul className={styles.toggles}>
                {NOTIFICATION_KEYS.map((key) => (
                  <li key={key}>
                    <label className={styles.toggle}>
                      {/* A real checkbox, hidden but focusable, with the
                          switch drawn beside it — so the keyboard, the label
                          click and the screen reader all behave normally. */}
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={notifications[key]}
                        onChange={(event) =>
                          setNotifications((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span className={styles.switch} aria-hidden="true">
                        <span className={styles.switchThumb} />
                      </span>
                      <span className={styles.toggleLabel}>
                        {t(`profile.notifications.${key}`)}
                      </span>
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
          <section className={`${styles.card} ${styles.danger}`} id="danger">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="danger" />
              {t('profile.sections.danger')}
            </h2>
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
