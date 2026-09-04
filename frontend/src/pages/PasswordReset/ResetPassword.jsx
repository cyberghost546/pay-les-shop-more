// src/pages/PasswordReset/ResetPassword.jsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AUTH_ERRORS, confirmPasswordReset } from '../../api/auth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './PasswordReset.module.css';

// Matches the signup form and the server's own rule. Length is what makes a
// password hard to guess; composition rules push people towards Password1!.
const MIN_PASSWORD_LENGTH = 12;

const FAILURE_KEYS = {
  [AUTH_ERRORS.RATE_LIMITED]: 'passwordReset.errors.tooMany',
  [AUTH_ERRORS.UNAVAILABLE]: 'passwordReset.errors.offline',
};

function validate({ password, confirm }) {
  const errors = {};

  if (!password) errors.password = 'passwordReset.errors.passwordRequired';
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = 'passwordReset.errors.passwordShort';

  if (confirm && password !== confirm)
    errors.confirm = 'passwordReset.errors.confirmMismatch';

  return errors;
}

export default function ResetPassword() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // The two halves of the link from the e-mail. Neither is inspected here —
  // they are opaque to the browser, and the server is what checks them.
  const { uid, token } = useParams();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // A dead link is the one failure with somewhere to go, so it is tracked
  // separately from the generic banner.
  const [linkDead, setLinkDead] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

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
      await confirmPasswordReset({ uid, token, password: form.password });

      // Not signed in by the reset — the server deliberately does not do
      // that — so the login form is where they go, with a note saying the
      // change worked so the trip does not look like a failure.
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (failure) {
      // The server rejects an expired, already-used or tampered link on the
      // `token` field; a password it will not accept on `new_password`.
      if (failure.fields?.token) {
        setLinkDead(true);
      } else if (failure.fields?.new_password) {
        setErrors({ password: 'passwordReset.errors.passwordWeak' });
      } else {
        setFailureKey(FAILURE_KEYS[failure.code] ?? 'passwordReset.errors.offline');
      }

      // Never keep a password around after a failed attempt.
      setForm({ password: '', confirm: '' });
    } finally {
      setBusy(false);
    }
  }

  if (linkDead) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('passwordReset.deadTitle')}</h1>
          <p className={styles.subtitle}>{t('passwordReset.deadBody')}</p>

          <p className={styles.footer}>
            <Link to="/forgot-password" className={styles.footerLink}>
              {t('passwordReset.requestAnother')}
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('passwordReset.chooseTitle')}</h1>
        <p className={styles.subtitle}>{t('passwordReset.chooseSubtitle')}</p>

        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>{t('passwordReset.newPassword')}</span>
            <span className={styles.passwordWrap}>
              <input
                className={`${styles.input} ${styles.passwordInput}`}
                type={revealed ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                autoFocus
                aria-invalid={Boolean(errors.password)}
                aria-describedby="reset-password-hint"
              />
              {/* One toggle drives both fields: people compare them */}
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

            <span className={styles.hint} id="reset-password-hint">
              {t('signup.passwordHint')}
            </span>

            {errors.password && (
              <span className={styles.error}>{t(errors.password)}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('passwordReset.confirm')}</span>
            <input
              className={styles.input}
              type={revealed ? 'text' : 'password'}
              name="confirm"
              value={form.confirm}
              onChange={handleChange}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? 'reset-confirm-error' : undefined}
            />
            {errors.confirm && (
              <span className={styles.error} id="reset-confirm-error">
                {t(errors.confirm)}
              </span>
            )}
          </label>

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy
              ? t('passwordReset.chooseSubmitting')
              : t('passwordReset.chooseSubmit')}
          </button>
        </form>

        <p className={styles.footer}>
          <Link to="/login" className={styles.footerLink}>
            {t('passwordReset.backToLogin')}
          </Link>
        </p>
      </div>
    </main>
  );
}
