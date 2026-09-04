// src/pages/Signup/Signup.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AUTH_ERRORS } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Signup.module.css';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirm: '',
  terms: false,
};

// Deliberately loose: catches typos, not every RFC-legal address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Digits, spaces, dashes, brackets and one optional leading +. Numbers are
// written a dozen different ways across the islands and the Netherlands, so
// this only checks the shape is plausible — the count of digits is the part
// worth enforcing.
const PHONE_PATTERN = /^\+?[\d\s()-]{7,}$/;

// Length is what actually makes a password hard to guess, so that is the only
// hard rule. Composition rules ("one capital, one symbol") mostly push people
// into predictable shapes like Password1! — current NIST guidance drops them.
const MIN_PASSWORD_LENGTH = 12;

// Returns translation keys rather than messages, so errors already on screen
// follow the visitor when they switch language.
function validate({ firstName, lastName, email, phone, password, confirm, terms }) {
  const errors = {};

  if (!firstName.trim()) errors.firstName = 'signup.errors.firstNameRequired';
  if (!lastName.trim()) errors.lastName = 'signup.errors.lastNameRequired';

  if (!email.trim()) errors.email = 'signup.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'signup.errors.emailInvalid';

  if (!phone.trim()) errors.phone = 'signup.errors.phoneRequired';
  else if (!PHONE_PATTERN.test(phone.trim()))
    errors.phone = 'signup.errors.phoneInvalid';

  if (!password) errors.password = 'signup.errors.passwordRequired';
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = 'signup.errors.passwordShort';

  // Only worth flagging once there is something to compare against.
  if (confirm && password !== confirm)
    errors.confirm = 'signup.errors.confirmMismatch';

  if (!terms) errors.terms = 'signup.errors.termsRequired';

  return errors;
}

// A rough four-step read on the password, for the meter only — it never blocks
// submission. Length dominates, with a small nudge for variety of characters.
function scorePassword(password) {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 16) score += 1;

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (variety >= 3) score += 1;

  return Math.min(score, 4);
}

const STRENGTH_KEYS = [
  'signup.strength.weak',
  'signup.strength.weak',
  'signup.strength.fair',
  'signup.strength.good',
  'signup.strength.strong',
];

const STRENGTH_CLASSES = ['weak', 'weak', 'fair', 'good', 'strong'];

const FAILURE_KEYS = {
  [AUTH_ERRORS.EMAIL_TAKEN]: 'signup.errors.taken',
  [AUTH_ERRORS.UNAVAILABLE]: 'signup.errors.offline',
  [AUTH_ERRORS.RATE_LIMITED]: 'signup.errors.tooMany',
  // Without this, anything the server rejected that the form did not catch
  // first — a password on the common-passwords list, a phone number the
  // validator did not like — fell through to the offline message and told
  // people to come back later, when what they need is to change one field.
  [AUTH_ERRORS.VALIDATION]: 'signup.errors.invalid',
};

// The API names its fields in snake_case and phrases its messages in English.
// Both are mapped here onto the form's own field names and translation keys,
// so something the server rejected appears under the right input, in the
// language the visitor is reading.
const SERVER_FIELDS = {
  email: { field: 'email', key: 'signup.errors.emailInvalid' },
  // username is the e-mail address; the form has no username input.
  username: { field: 'email', key: 'signup.errors.emailInvalid' },
  phone_number: { field: 'phone', key: 'signup.errors.phoneInvalid' },
  // The form already enforces the length, so anything the server still
  // objects to is the password being guessable: too common, all digits, or
  // too close to the name or e-mail address.
  password: { field: 'password', key: 'signup.errors.passwordWeak' },
  first_name: { field: 'firstName', key: 'signup.errors.firstNameRequired' },
  last_name: { field: 'lastName', key: 'signup.errors.lastNameRequired' },
};

/** Server field errors, in the shape the form already renders. */
function serverFieldErrors(fields) {
  const mapped = {};

  for (const name of Object.keys(fields ?? {})) {
    const entry = SERVER_FIELDS[name];
    if (entry) mapped[entry.field] = entry.key;
  }

  return mapped;
}

export default function Signup() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { t } = useLanguage();
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const score = scorePassword(form.password);
  // The address is the field at fault, so it is marked as invalid even though
  // the message itself sits in the banner with its link.
  const isTaken = failureKey === 'signup.errors.taken';

  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear a field's error as soon as the visitor edits it again.
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const found = validate(form);
    setErrors(found);
    setFailureKey(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await signUp({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });

      // The API signs the new customer straight in, so send them to their
      // account rather than back to the login form.
      navigate('/profile', { replace: true });
    } catch (error) {
      // Whatever the server objected to, shown against the field it belongs
      // to. The duplicate address is the exception: it gets the banner below,
      // which is the only place a link to the login page fits.
      setErrors(serverFieldErrors(error.fields));
      setFailureKey(FAILURE_KEYS[error.code] ?? 'signup.errors.offline');
      // Never keep passwords around after a failed attempt.
      setForm((current) => ({ ...current, password: '', confirm: '' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('signup.title')}</h1>
        <p className={styles.subtitle}>{t('signup.subtitle')}</p>

        {/* role="alert" so a screen reader announces the failure as it appears */}
        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}{' '}
            {/* An address that is already registered is not really an error —
                the visitor has an account and is on the wrong page. Saying so
                without offering the way across leaves them stuck. */}
            {isTaken && (
              <Link to="/login" state={{ email: form.email.trim() }} className={styles.failureLink}>
                {t('signup.errors.takenLogin')}
              </Link>
            )}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Side by side on anything but a narrow phone */}
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>{t('signup.firstName')}</span>
              <input
                className={styles.input}
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                // given-name / family-name, not "name": browsers fill the two
                // halves separately and get it wrong with the generic token.
                autoComplete="given-name"
                autoFocus
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={
                  errors.firstName ? 'signup-firstname-error' : undefined
                }
              />
              {errors.firstName && (
                <span className={styles.error} id="signup-firstname-error">
                  {t(errors.firstName)}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('signup.lastName')}</span>
              <input
                className={styles.input}
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                autoComplete="family-name"
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={
                  errors.lastName ? 'signup-lastname-error' : undefined
                }
              />
              {errors.lastName && (
                <span className={styles.error} id="signup-lastname-error">
                  {t(errors.lastName)}
                </span>
              )}
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{t('signup.email')}</span>
            <input
              className={styles.input}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              aria-invalid={Boolean(errors.email) || isTaken}
              aria-describedby={errors.email ? 'signup-email-error' : undefined}
            />
            {errors.email && (
              <span className={styles.error} id="signup-email-error">
                {t(errors.email)}
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('signup.phone')}</span>
            <input
              className={styles.input}
              // type="tel" brings up the number pad on a phone
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'signup-phone-error' : undefined}
            />
            {errors.phone && (
              <span className={styles.error} id="signup-phone-error">
                {t(errors.phone)}
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('signup.password')}</span>
            <span className={styles.passwordWrap}>
              <input
                className={`${styles.input} ${styles.passwordInput}`}
                type={revealed ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby="signup-password-hint"
              />
              {/* One toggle drives both password fields: people compare them */}
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setRevealed((current) => !current)}
                aria-pressed={revealed}
                aria-label={
                  revealed ? t('signup.hidePassword') : t('signup.showPassword')
                }
              >
                {revealed ? (
                  <svg
                    className={styles.revealIcon}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.1 3.6" />
                    <path d="M6.5 8.3A15.3 15.3 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3.6-.75" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                ) : (
                  <svg
                    className={styles.revealIcon}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>

            {/* Meter is advisory: it reports, it does not gate */}
            {form.password && (
              <span className={styles.strength}>
                <span
                  className={styles.meter}
                  role="img"
                  aria-label={`${t('signup.strength.label')}: ${t(
                    STRENGTH_KEYS[score],
                  )}`}
                >
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className={
                        step <= score
                          ? `${styles.bar} ${styles[STRENGTH_CLASSES[score]]}`
                          : styles.bar
                      }
                    />
                  ))}
                </span>
                <span className={styles.strengthLabel}>
                  {t(STRENGTH_KEYS[score])}
                </span>
              </span>
            )}

            <span className={styles.hint} id="signup-password-hint">
              {t('signup.passwordHint')}
            </span>

            {errors.password && (
              <span className={styles.error}>{t(errors.password)}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('signup.confirm')}</span>
            <input
              className={styles.input}
              type={revealed ? 'text' : 'password'}
              name="confirm"
              value={form.confirm}
              onChange={handleChange}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={
                errors.confirm ? 'signup-confirm-error' : undefined
              }
            />
            {errors.confirm && (
              <span className={styles.error} id="signup-confirm-error">
                {t(errors.confirm)}
              </span>
            )}
          </label>

          <div className={styles.field}>
            <label className={styles.terms}>
              <input
                type="checkbox"
                name="terms"
                checked={form.terms}
                onChange={handleChange}
                aria-invalid={Boolean(errors.terms)}
              />
              <span>
                {t('signup.terms')}{' '}
                <Link to="/terms" className={styles.inlineLink}>
                  {t('signup.termsLink')}
                </Link>{' '}
                {t('signup.and')}{' '}
                <Link to="/privacy" className={styles.inlineLink}>
                  {t('signup.privacyLink')}
                </Link>
                .
              </span>
            </label>
            {errors.terms && (
              <span className={styles.error}>{t(errors.terms)}</span>
            )}
          </div>

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('signup.submitting') : t('signup.submit')}
          </button>
        </form>

        <p className={styles.footer}>
          {t('signup.haveAccount')}{' '}
          <Link to="/login" className={styles.footerLink}>
            {t('signup.loginLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
