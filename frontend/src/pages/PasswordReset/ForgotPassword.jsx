// src/pages/PasswordReset/ForgotPassword.jsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AUTH_ERRORS, requestPasswordReset } from '../../api/auth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './PasswordReset.module.css';

// Deliberately loose: catches typos, not every RFC-legal address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const FAILURE_KEYS = {
  [AUTH_ERRORS.RATE_LIMITED]: 'passwordReset.errors.tooMany',
  [AUTH_ERRORS.UNAVAILABLE]: 'passwordReset.errors.offline',
  [AUTH_ERRORS.VALIDATION]: 'passwordReset.errors.emailInvalid',
};

export default function ForgotPassword() {
  const { t, language } = useLanguage();
  const location = useLocation();

  // Carried over from the login page when the visitor had already typed an
  // address there, so they do not type it twice.
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [error, setError] = useState(null);
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const address = email.trim();
    setFailureKey(null);

    if (!address) return setError('passwordReset.errors.emailRequired');
    if (!EMAIL_PATTERN.test(address))
      return setError('passwordReset.errors.emailInvalid');

    setError(null);
    setBusy(true);

    try {
      await requestPasswordReset({ email: address, language });
      setSent(true);
    } catch (failure) {
      setFailureKey(FAILURE_KEYS[failure.code] ?? 'passwordReset.errors.offline');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('passwordReset.requestTitle')}</h1>

        {sent ? (
          <>
            {/* Worded as a conditional on purpose. The server answers the same
                way for a registered address and an unknown one, so that this
                form cannot be used to find out who has an account here — and
                the page must not promise more than the server actually said. */}
            <p className={styles.sent} role="status">
              {t('passwordReset.sentBody')}
              <span className={styles.sentNote}>
                {t('passwordReset.sentNote')}
              </span>
            </p>

            <p className={styles.footer}>
              <Link to="/login" className={styles.footerLink}>
                {t('passwordReset.backToLogin')}
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>{t('passwordReset.requestSubtitle')}</p>

            {failureKey && (
              <p className={styles.failure} role="alert">
                {t(failureKey)}
              </p>
            )}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>{t('passwordReset.email')}</span>
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  autoComplete="email"
                  autoFocus
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'forgot-email-error' : undefined}
                />
                {error && (
                  <span className={styles.error} id="forgot-email-error">
                    {t(error)}
                  </span>
                )}
              </label>

              <button type="submit" className={styles.submit} disabled={busy}>
                {busy
                  ? t('passwordReset.requestSubmitting')
                  : t('passwordReset.requestSubmit')}
              </button>
            </form>

            <p className={styles.footer}>
              <Link to="/login" className={styles.footerLink}>
                {t('passwordReset.backToLogin')}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
