// src/components/Contact/Contact.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import containerShip from '../../images/container-ship.webp';
import styles from './Contact.module.css';

// Address block: label in the left column, value on the right.
// `lines` keeps the street and town on separate rows, as in the design.
const DETAILS = [
  {
    label: 'Adres:',
    lines: ['Hertzstraat 10 | 2652 XX', 'Berkel en Rodenrijs'],
  },
  {
    label: 'Telefoon:',
    lines: ['+31 10 767 0 371'],
    href: 'tel:+31107670371',
  },
  {
    label: 'E-mail:',
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

const SUBJECTS = [
  'Algemene vraag',
  'Verzending & tracking',
  'BTW-vrij verzenden',
  'Klacht',
  'Samenwerking',
];

const EMPTY_FORM = {
  name: '',
  email: '',
  subject: SUBJECTS[0],
  message: '',
};

// Deliberately loose: catches typos, not every RFC-legal address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate({ name, email, message }) {
  const errors = {};

  if (!name.trim()) errors.name = 'Vul uw naam in.';

  if (!email.trim()) errors.email = 'Vul uw e-mailadres in.';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'Dit e-mailadres lijkt niet te kloppen.';

  if (message.trim().length < 10)
    errors.message = 'Uw bericht moet minstens 10 tekens bevatten.';

  return errors;
}

export default function Contact() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);

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

  function handleSubmit(event) {
    event.preventDefault();

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // No backend yet: log the payload and show the confirmation.
    console.log('Contact form submitted', form);
    setForm(EMPTY_FORM);
    setSent(true);
  }

  return (
    <>
      <section className={styles.banner}>
        <div className={styles.titlePanel}>
          <p className={styles.eyebrow}>NEEM</p>
          <h1 className={styles.title}>CONTACT OP</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              Home
            </Link>{' '}
            &raquo; Contact
          </p>
        </div>

        <img
          src={containerShip}
          alt="Container ship at sea loaded with freight"
          className={styles.bannerImage}
        />
      </section>

      <section className={styles.content}>
        <h2 className={styles.sectionTitle}>Stuur ons een bericht</h2>

        <div className={styles.grid}>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>Naam</span>
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
                  <span className={styles.error}>{errors.name}</span>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>E-mail</span>
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
                  <span className={styles.error}>{errors.email}</span>
                )}
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Onderwerp</span>
              <select
                className={styles.input}
                name="subject"
                value={form.subject}
                onChange={handleChange}
              >
                {SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Bericht</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                name="message"
                rows={7}
                value={form.message}
                onChange={handleChange}
                aria-invalid={Boolean(errors.message)}
              />
              {errors.message && (
                <span className={styles.error}>{errors.message}</span>
              )}
            </label>

            <button type="submit" className={styles.submit}>
              Verstuur bericht
            </button>

            {sent && (
              <p className={styles.success} role="status">
                Bedankt! Uw bericht is verstuurd &mdash; we reageren binnen twee
                werkdagen.
              </p>
            )}
          </form>

          <aside className={styles.details}>
            <h3 className={styles.detailsTitle}>Adresgegevens</h3>

            <dl className={styles.detailList}>
              {DETAILS.map((item) => (
                <div key={item.label} className={styles.detail}>
                  <dt className={styles.detailLabel}>{item.label}</dt>
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
              Openen in Maps
            </a>
          </aside>
        </div>
      </section>

      {/* Full-width map band, as in the reference design */}
      <section className={styles.mapBand} aria-label="Locatie op de kaart">
        <iframe
          className={styles.map}
          src={MAP_SRC}
          title="Kaart met de locatie aan de Hertzstraat 10, Berkel en Rodenrijs"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </section>
    </>
  );
}
