// src/pages/Login/Login.jsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AUTH_ERRORS } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Login.module.css';

const EMPTY_FORM = { email: '', password: '', remember: false };

// Deliberately loose: catches typos, not every RFC-legal address. The server
// is the real authority on whether an address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Returns translation keys rather than messages, so errors already on screen
// follow the visitor when they switch language.
function validate({ email, password }) {
  const errors = {};

  if (!email.trim()) errors.email = 'login.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'login.errors.emailInvalid';

  if (!password) errors.password = 'login.errors.passwordRequired';

  return errors;
}

// Maps a failure from the auth layer onto the message the visitor sees.
const FAILURE_KEYS = {
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'login.errors.failed',
  [AUTH_ERRORS.UNAVAILABLE]: 'login.errors.offline',
  [AUTH_ERRORS.RATE_LIMITED]: 'login.errors.tooMany',
  // The API rejects an unusable body with 400; for this form that means the
  // credentials were not accepted either way.
  [AUTH_ERRORS.VALIDATION]: 'login.errors.failed',
};

export default function Login() {
  const location = useLocation();

  // Signup sends the address along when it turns out to be registered
  // already, so the visitor does not type it a second time. Read once, as the
  // initial value — this is a starting point for the field, not a value the
  // page keeps in sync with the route.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    email: location.state?.email ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { t } = useLanguage();
  const { signIn } = useAuth();
  const navigate = useNavigate();

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
      await signIn({
        email: form.email.trim(),
        password: form.password,
        remember: form.remember,
      });

      // Back to the page they were trying to reach, or to their account.
      // replace: the login page should not sit in history behind them.
      navigate(location.state?.from ?? '/profile', { replace: true });
    } catch (error) {
      setFailureKey(FAILURE_KEYS[error.code] ?? 'login.errors.offline');
      // Never keep the password around after a failed attempt.
      setForm((current) => ({ ...current, password: '' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.subtitle}>{t('login.subtitle')}</p>

        {/* Sent here by the reset page, which deliberately does not sign
            anyone in — without this the trip would look like it failed. */}
        {location.state?.passwordReset && (
          <p className={styles.success} role="status">
            {t('passwordReset.done')}
          </p>
        )}

        {/* role="alert" so a screen reader announces the failure as it appears */}
        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>{t('login.email')}</span>
            <input
              className={styles.input}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              // The first thing a returning visitor wants to type
              autoFocus
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {errors.email && (
              <span className={styles.error} id="login-email-error">
                {t(errors.email)}
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('login.password')}</span>
            <span className={styles.passwordWrap}>
              <input
                className={`${styles.input} ${styles.passwordInput}`}
                type={revealed ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'login-password-error' : undefined
                }
              />
              {/* Lets people check a typo instead of retyping the whole thing */}
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setRevealed((current) => !current)}
                aria-pressed={revealed}
                aria-label={
                  revealed ? t('login.hidePassword') : t('login.showPassword')
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
            {errors.password && (
              <span className={styles.error} id="login-password-error">
                {t(errors.password)}
              </span>
            )}
          </label>

          <div className={styles.row}>
            <label className={styles.remember}>
              <input
                type="checkbox"
                name="remember"
                checked={form.remember}
                onChange={handleChange}
              />
              {t('login.remember')}
            </label>

            <Link
              to="/forgot-password"
              // Carries whatever they have already typed, so the next page
              // does not ask for it again.
              state={{ email: form.email.trim() }}
              className={styles.forgot}
            >
              {t('login.forgot')}
            </Link>
          </div>

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className={styles.footer}>
          {t('login.noAccount')}{' '}
          <Link to="/signup" className={styles.footerLink}>
            {t('login.signupLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
