// src/components/Contact/Contact.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import willemstad from '../../images/stock-photo-view-of-downtown-willemstad-curacao-netherlands-antilles-650249764.jpg';
import { sendContactMessage } from '../../api/contact';
import { API_ERRORS } from '../../api/client';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Contact.module.css';

// Address block: label in the left column, value on the right. Only the labels
// translate — a street name and a phone number read the same in every language.
// `lines` keeps the street and town on separate rows, as in the design.
const DETAILS = [
  {
    labelKey: 'contact.details.address',
    lines: ['Hertzstraat 10 | 2652 XX', 'Berkel en Rodenrijs'],
  },
  {
    labelKey: 'contact.details.phone',
    lines: ['+31 10 767 0 371'],
    href: 'tel:+31107670371',
  },
  {
    labelKey: 'contact.details.email',
    lines: ['info@paylesshopmore.com'],
    href: 'mailto:info@paylesshopmore.com',
  },
];

// Google Maps embed centred on the office (Carib Intertrans).
const MAP_QUERY = 'Hertzstraat 10, 2652 XX Berkel en Rodenrijs';
const MAP_SRC = `https://www.google.com/maps?q=${encodeURIComponent(
  MAP_QUERY,
)}&output=embed`;
const MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  MAP_QUERY,
)}`;

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

// Returns translation keys rather than messages, so an error already on screen
// follows the visitor when they change language.
function validate({ name, email, message }) {
  const errors = {};

  if (!name.trim()) errors.name = 'contact.errors.name';

  if (!email.trim()) errors.email = 'contact.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'contact.errors.emailInvalid';

  if (message.trim().length < 10) errors.message = 'contact.errors.message';

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
        // staff read in the admin.
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

  return (
    <>
      {/* The Willemstad waterfront sits behind the title; the overlay in the
          stylesheet keeps the white text readable over the bright photo. */}
      <section
        className={styles.banner}
        style={{ backgroundImage: `url(${willemstad})` }}
      >
        <div className={styles.titlePanel}>
          <p className={styles.eyebrow}>{t('contact.eyebrow')}</p>
          <h1 className={styles.title}>{t('contact.title')}</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            &raquo; {t('contact.breadcrumb')}
          </p>
        </div>
      </section>

      <section className={styles.content}>
        <h2 className={styles.sectionTitle}>{t('contact.formTitle')}</h2>

        <div className={styles.grid}>
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
                <span className={styles.label}>
                  {t('contact.fields.email')}
                </span>
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
                className={styles.input}
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
              {errors.message && (
                <span className={styles.error}>{t(errors.message)}</span>
              )}
            </label>

            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? t('contact.sending') : t('contact.submit')}
            </button>

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
          </form>

          <aside className={styles.details}>
            <h3 className={styles.detailsTitle}>
              {t('contact.addressTitle')}
            </h3>

            <dl className={styles.detailList}>
              {DETAILS.map((item) => (
                <div key={item.labelKey} className={styles.detail}>
                  <dt className={styles.detailLabel}>{t(item.labelKey)}</dt>
                  <dd className={styles.detailValue}>
                    {item.href ? (
                      <a href={item.href} className={styles.detailLink}>
                        {item.lines[0]}
                      </a>
                    ) : (
                      item.lines.map((line) => <span key={line}>{line}</span>)
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            <a
              className={styles.mapLink}
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('contact.openInMaps')}
            </a>
          </aside>
        </div>
      </section>

      {/* The map sits in a panel styled like the form above it */}
      <section className={styles.mapSection} aria-label={t('contact.mapLabel')}>
        <div className={styles.mapPanel}>
          <iframe
            className={styles.map}
            src={MAP_SRC}
            title={t('contact.mapTitle')}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </section>
    </>
  );
}
