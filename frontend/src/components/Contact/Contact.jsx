// src/components/Contact/Contact.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendContactMessage } from '../../api/contact';
import { API_ERRORS } from '../../api/client';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Contact.module.css';

const OFFICE = {
  street: 'Hertzstraat 10',
  postcode: '2652 XX',
  town: 'Berkel en Rodenrijs',
  phone: '+31 10 767 0 371',
  phoneHref: 'tel:+31107670371',
  email: 'info@paylesshopmore.com',
};

// Google Maps embed centred on the office.
const MAP_QUERY = `${OFFICE.street}, ${OFFICE.postcode} ${OFFICE.town}`;
const MAP_SRC = `https://www.google.com/maps?q=${encodeURIComponent(
  MAP_QUERY,
)}&output=embed`;
const MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  MAP_QUERY,
)}`;

// The three ways to reach the company, as cards. Only the labels translate — a
// street name and a phone number read the same in every language.
const METHODS = [
  {
    id: 'email',
    labelKey: 'contact.details.email',
    value: OFFICE.email,
    href: `mailto:${OFFICE.email}`,
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3.5 6.5 8.5 6 8.5-6" />
      </>
    ),
  },
  {
    id: 'phone',
    labelKey: 'contact.details.phone',
    value: OFFICE.phone,
    href: OFFICE.phoneHref,
    icon: (
      <>
        <path d="M7 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" />
      </>
    ),
  },
  {
    id: 'address',
    labelKey: 'contact.details.address',
    value: `${OFFICE.street}, ${OFFICE.postcode} ${OFFICE.town}`,
    href: MAP_LINK,
    external: true,
    icon: (
      <>
        <path d="M12 2.5a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7Z" />
        <circle cx="12" cy="9.5" r="2.6" />
      </>
    ),
  },
];

const EMPTY_FORM = {
  name: '',
  email: '',
  // Stored as an index into the translated subject list, not as the label
  // itself: switching language mid-form would otherwise strand the value.
  subject: 0,
  message: '',
};

// Deliberately loose: catches typos, not every RFC-legal address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MIN_MESSAGE = 10;

// Returns translation keys rather than messages, so an error already on screen
// follows the visitor when they change language.
function validate({ name, email, message }) {
  const errors = {};

  if (!name.trim()) errors.name = 'contact.errors.name';

  if (!email.trim()) errors.email = 'contact.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'contact.errors.emailInvalid';

  if (message.trim().length < MIN_MESSAGE) errors.message = 'contact.errors.message';

  return errors;
}

// Maps an API failure onto the message the visitor sees.
const FAILURE_KEYS = {
  [API_ERRORS.RATE_LIMITED]: 'contact.errors.tooMany',
  [API_ERRORS.VALIDATION]: 'contact.errors.invalid',
};

export default function Contact() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const { t, language } = useLanguage();

  const subjects = t('contact.subjects');

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

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
    setSent(false);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await sendContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        // The subject is stored as an index; send the label, which is what
        // staff read in the dashboard.
        subject: subjects[form.subject],
        message: form.message.trim(),
        language,
      });
      setForm(EMPTY_FORM);
      setSent(true);
    } catch (error) {
      setFailureKey(FAILURE_KEYS[error.code] ?? 'contact.errors.offline');
    } finally {
      setBusy(false);
    }
  }

  const remaining = MIN_MESSAGE - form.message.trim().length;

  return (
    <main className={styles.page}>
      {/* A painted band rather than a photograph. It reads as part of the site
          instead of a stock image, and it keeps the white text legible without
          an overlay fighting a bright picture underneath. */}
      <section className={styles.banner}>
        <div className={styles.bannerInner}>
          <p className={styles.eyebrow}>{t('contact.eyebrow')}</p>
          <h1 className={styles.title}>{t('contact.title')}</h1>
          <p className={styles.lead}>{t('contact.lead')}</p>
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            <span aria-hidden="true">›</span> {t('contact.breadcrumb')}
          </p>
        </div>
      </section>

      {/* The three ways to reach us, above the form — most people want one of
          these rather than to fill anything in. */}
      <section className={styles.methods} aria-label={t('contact.addressTitle')}>
        {METHODS.map((method) => (
          <a
            key={method.id}
            className={styles.method}
            href={method.href}
            {...(method.external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            <span className={styles.methodIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">{method.icon}</svg>
            </span>
            <span className={styles.methodLabel}>{t(method.labelKey)}</span>
            <span className={styles.methodValue}>{method.value}</span>
          </a>
        ))}
      </section>

      <section className={styles.content}>
        <div className={styles.card}>
          <h2 className={styles.formTitle}>{t('contact.formTitle')}</h2>

          {failureKey && (
            <p className={styles.failure} role="alert">
              {t(failureKey)}
            </p>
          )}

          {sent && (
            <p className={styles.success} role="status">
              {t('contact.success')}
            </p>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t('contact.fields.name')}</span>
                <input
                  className={styles.input}
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && (
                  <span className={styles.error}>{t(errors.name)}</span>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{t('contact.fields.email')}</span>
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && (
                  <span className={styles.error}>{t(errors.email)}</span>
                )}
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>{t('contact.fields.subject')}</span>
              <select
                className={`${styles.input} ${styles.select}`}
                name="subject"
                value={form.subject}
                onChange={handleChange}
              >
                {subjects.map((subject, index) => (
                  <option key={subject} value={index}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('contact.fields.message')}</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                name="message"
                rows={7}
                value={form.message}
                onChange={handleChange}
                aria-invalid={Boolean(errors.message)}
              />
              {errors.message ? (
                <span className={styles.error}>{t(errors.message)}</span>
              ) : (
                // Said before submitting rather than after being refused: the
                // minimum is the one rule this form has that is not obvious.
                remaining > 0 &&
                form.message.length > 0 && (
                  <span className={styles.counter}>
                    {t('contact.charactersToGo').replace('{count}', remaining)}
                  </span>
                )
              )}
            </label>

            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? t('contact.sending') : t('contact.submit')}
            </button>
          </form>
        </div>

        <aside className={styles.mapCard}>
          <iframe
            className={styles.map}
            src={MAP_SRC}
            title={t('contact.mapTitle')}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <div className={styles.mapFoot}>
            <p className={styles.mapAddress}>
              <b>{OFFICE.street}</b>
              <br />
              {OFFICE.postcode} {OFFICE.town}
            </p>
            <a
              className={styles.mapLink}
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('contact.openInMaps')} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </aside>
      </section>
    </main>
  );
}
