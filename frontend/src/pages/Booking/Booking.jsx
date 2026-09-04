// src/pages/Booking/Booking.jsx
//
// The boekingsbon, typed rather than written. It follows the paper form's
// order so that somebody who knows the paper one is not hunting for anything,
// but it only asks for the sender's half — the shipping number, volume,
// weight and packing assessment are filled in at the counter afterwards.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DESTINATIONS,
  FREIGHT,
  PACKING,
  PAYMENT,
  UNITS,
  VEHICLES,
  submitBooking,
} from '../../api/booking';
import { API_ERRORS } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Booking.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

const EMPTY = {
  freight: 'sea',
  destination: 'CW',
  destination_other: '',

  sender_first_name: '',
  sender_last_name: '',
  sender_address: '',
  sender_postal_code: '',
  sender_city: '',
  sender_phone: '',
  sender_email: '',

  recipient_first_name: '',
  recipient_last_name: '',
  recipient_address: '',
  recipient_city: '',
  recipient_phone: '',
  recipient_email: '',

  packing: 'sender',
  payment: 'bank',
  quantity: '1',
  unit: 'boxes',
  contents: '',
  contents_attached: false,
  value_eur: '',
  vehicle: 'na',

  emigration: false,
  id_present: false,
  deregistered: false,
  deregistration_present: false,

  insured: false,
  insured_value_eur: '',
  notes: '',

  signature_name: '',
  agreed_terms: false,
};

// Every required text field, with the key of the message shown when it is
// empty. Kept as data so the validator below is one loop rather than thirty
// near-identical ifs.
const REQUIRED = [
  ['sender_first_name', 'booking.errors.required'],
  ['sender_last_name', 'booking.errors.required'],
  ['sender_address', 'booking.errors.required'],
  ['sender_postal_code', 'booking.errors.required'],
  ['sender_city', 'booking.errors.required'],
  ['sender_phone', 'booking.errors.required'],
  ['sender_email', 'booking.errors.required'],
  ['recipient_first_name', 'booking.errors.required'],
  ['recipient_last_name', 'booking.errors.required'],
  ['recipient_address', 'booking.errors.required'],
  ['recipient_city', 'booking.errors.required'],
  ['recipient_phone', 'booking.errors.required'],
];

function validate(form) {
  const errors = {};

  for (const [field, key] of REQUIRED) {
    if (!String(form[field]).trim()) errors[field] = key;
  }

  if (form.sender_email && !EMAIL_PATTERN.test(form.sender_email.trim()))
    errors.sender_email = 'booking.errors.email';
  if (form.recipient_email && !EMAIL_PATTERN.test(form.recipient_email.trim()))
    errors.recipient_email = 'booking.errors.email';

  for (const field of ['sender_phone', 'recipient_phone']) {
    if (form[field].trim() && !PHONE_PATTERN.test(form[field].trim()))
      errors[field] = 'booking.errors.phone';
  }

  if (form.destination === 'other' && !form.destination_other.trim())
    errors.destination_other = 'booking.errors.required';

  if (!(Number(form.quantity) >= 1)) errors.quantity = 'booking.errors.quantity';
  if (form.value_eur === '' || Number(form.value_eur) < 0)
    errors.value_eur = 'booking.errors.value';

  // Either a description or a note that the list follows separately — the
  // paper form's "Zie bijlage" box.
  if (!form.contents.trim() && !form.contents_attached)
    errors.contents = 'booking.errors.contents';

  if (form.insured && !(Number(form.insured_value_eur) > 0))
    errors.insured_value_eur = 'booking.errors.insuredValue';

  if (form.signature_name.trim().length < 3)
    errors.signature_name = 'booking.errors.signature';
  if (!form.agreed_terms) errors.agreed_terms = 'booking.errors.terms';

  return errors;
}

const FAILURE_KEYS = {
  [API_ERRORS.RATE_LIMITED]: 'booking.errors.tooMany',
  [API_ERRORS.VALIDATION]: 'booking.errors.invalid',
  [API_ERRORS.UNAVAILABLE]: 'booking.errors.offline',
};

/** A labelled text input, since the form has thirty of them. */
function TextField({
  name,
  labelKey,
  type = 'text',
  autoComplete,
  required = true,
  form,
  errors,
  onChange,
  t,
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {t(labelKey)}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        className={styles.input}
        type={type}
        name={name}
        value={form[name]}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={Boolean(errors[name])}
      />
      {errors[name] && <span className={styles.error}>{t(errors[name])}</span>}
    </label>
  );
}

/** A row of radio buttons rendered as selectable cards. */
function ChoiceRow({ name, options, form, onChange, t }) {
  return (
    <div className={styles.choices} role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label
          key={option.value}
          className={
            form[name] === option.value
              ? `${styles.choice} ${styles.choiceOn}`
              : styles.choice
          }
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={form[name] === option.value}
            onChange={onChange}
            className={styles.choiceInput}
          />
          {option.labelKey ? t(option.labelKey) : option.label}
        </label>
      ))}
    </div>
  );
}

export default function Booking() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  // A signed-in customer already told us who they are; the sender block starts
  // filled in and stays editable, because people post on behalf of others.
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    sender_first_name: user?.firstName ?? '',
    sender_last_name: user?.lastName ?? '',
    sender_email: user?.email ?? '',
    sender_phone: user?.phone ?? '',
    signature_name: user?.name?.trim() ?? '',
  }));

  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState(null);

  function set(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    set(name, type === 'checkbox' ? checked : value);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const found = validate(form);
    setErrors(found);
    setFailureKey(null);

    if (Object.keys(found).length > 0) {
      // Straight to the first thing that needs fixing: this form is long
      // enough that an error above the fold is an error nobody sees.
      document
        .querySelector(`[name="${Object.keys(found)[0]}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    setBusy(true);
    try {
      const saved = await submitBooking({
        ...form,
        quantity: Number(form.quantity),
        value_eur: form.value_eur,
        insured_value_eur: form.insured ? form.insured_value_eur : null,
        language,
      });
      setReference(saved);
    } catch (error) {
      setFailureKey(FAILURE_KEYS[error.code] ?? 'booking.errors.offline');
    } finally {
      setBusy(false);
    }
  }

  // Spread into each field below. A plain object, deliberately — a wrapper
  // component declared here would be a new component type on every render,
  // and React would remount the input on every keystroke.
  const shared = { form, errors, onChange: handleChange, t };

  if (reference) {
    return (
      <main className={styles.page}>
        <section className={styles.done}>
          <span className={styles.doneMark} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 className={styles.doneTitle}>{t('booking.done.title')}</h1>
          <p className={styles.doneBody}>{t('booking.done.body')}</p>
          <p className={styles.doneRef}>
            {t('booking.done.reference')} <b>#{reference.id}</b>
          </p>
          <Link to="/" className={styles.doneLink}>
            {t('booking.done.home')}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerInner}>
          <p className={styles.eyebrow}>Carib Intertrans</p>
          <h1 className={styles.title}>{t('booking.title')}</h1>
          <p className={styles.lead}>{t('booking.lead')}</p>
        </div>
      </section>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}
          </p>
        )}

        {/* 1 — the shipment ------------------------------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.shipment')}</legend>

          <div className={styles.field}>
            <span className={styles.label}>{t('booking.freightLabel')}</span>
            <ChoiceRow name="freight" options={FREIGHT} {...shared} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{t('booking.destinationLabel')}</span>
            <ChoiceRow name="destination" options={DESTINATIONS} {...shared} />
            {form.destination === 'other' && (
              <>
                <input
                  className={styles.input}
                  type="text"
                  name="destination_other"
                  value={form.destination_other}
                  onChange={handleChange}
                  placeholder={t('booking.destinationOtherPlaceholder')}
                  aria-invalid={Boolean(errors.destination_other)}
                  aria-label={t('booking.destinationOther')}
                />
                {errors.destination_other && (
                  <span className={styles.error}>{t(errors.destination_other)}</span>
                )}
              </>
            )}
          </div>
        </fieldset>

        {/* 2 — sender ------------------------------------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.sender')}</legend>

          <div className={styles.row}>
            <TextField name="sender_first_name" labelKey="booking.firstName" autoComplete="given-name" {...shared} />
            <TextField name="sender_last_name" labelKey="booking.lastName" autoComplete="family-name" {...shared} />
          </div>
          <TextField name="sender_address" labelKey="booking.address" autoComplete="street-address" {...shared} />
          <div className={styles.row}>
            <TextField name="sender_postal_code" labelKey="booking.postalCode" autoComplete="postal-code" {...shared} />
            <TextField name="sender_city" labelKey="booking.city" autoComplete="address-level2" {...shared} />
          </div>
          <div className={styles.row}>
            <TextField name="sender_phone" labelKey="booking.phone" type="tel" autoComplete="tel" {...shared} />
            <TextField name="sender_email" labelKey="booking.email" type="email" autoComplete="email" {...shared} />
          </div>
        </fieldset>

        {/* 3 — recipient ---------------------------------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.recipient')}</legend>

          <div className={styles.row}>
            <TextField name="recipient_first_name" labelKey="booking.firstName" {...shared} />
            <TextField name="recipient_last_name" labelKey="booking.lastName" {...shared} />
          </div>
          <TextField name="recipient_address" labelKey="booking.address" {...shared} />
          <TextField name="recipient_city" labelKey="booking.city" {...shared} />
          <div className={styles.row}>
            <TextField name="recipient_phone" labelKey="booking.phone" type="tel" {...shared} />
            <TextField
              name="recipient_email"
              labelKey="booking.emailOptional"
              type="email"
              required={false} {...shared} />
          </div>
        </fieldset>

        {/* 4 — the consignment ---------------------------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.consignment')}</legend>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>
                {t('booking.quantity')}
                <span className={styles.required} aria-hidden="true"> *</span>
              </span>
              <input
                className={styles.input}
                type="number"
                name="quantity"
                min="1"
                value={form.quantity}
                onChange={handleChange}
                aria-invalid={Boolean(errors.quantity)}
              />
              {errors.quantity && (
                <span className={styles.error}>{t(errors.quantity)}</span>
              )}
            </label>

            <div className={styles.field}>
              <span className={styles.label}>{t('booking.unit')}</span>
              <ChoiceRow name="unit" options={UNITS} {...shared} />
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>
              {t('booking.contents')}
              <span className={styles.required} aria-hidden="true"> *</span>
            </span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              name="contents"
              rows={4}
              value={form.contents}
              onChange={handleChange}
              aria-invalid={Boolean(errors.contents)}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                name="contents_attached"
                checked={form.contents_attached}
                onChange={handleChange}
              />
              {t('booking.contentsAttached')}
            </label>
            {errors.contents && (
              <span className={styles.error}>{t(errors.contents)}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              {t('booking.value')}
              <span className={styles.required} aria-hidden="true"> *</span>
            </span>
            <div className={styles.money}>
              <span className={styles.moneySign} aria-hidden="true">€</span>
              <input
                className={`${styles.input} ${styles.moneyInput}`}
                type="number"
                name="value_eur"
                min="0"
                step="0.01"
                value={form.value_eur}
                onChange={handleChange}
                aria-invalid={Boolean(errors.value_eur)}
              />
            </div>
            {/* Says why it is being asked for. On the paper form this is the
                clause people skip and then dispute. */}
            <span className={styles.hint}>{t('booking.valueHint')}</span>
            {errors.value_eur && (
              <span className={styles.error}>{t(errors.value_eur)}</span>
            )}
          </label>

          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.label}>{t('booking.packingLabel')}</span>
              <ChoiceRow name="packing" options={PACKING} {...shared} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('booking.paymentLabel')}</span>
              <ChoiceRow name="payment" options={PAYMENT} {...shared} />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{t('booking.vehicleLabel')}</span>
            <ChoiceRow name="vehicle" options={VEHICLES} {...shared} />
          </div>
        </fieldset>

        {/* 5 — emigration, only when it applies ----------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.emigration')}</legend>

          <label className={styles.check}>
            <input
              type="checkbox"
              name="emigration"
              checked={form.emigration}
              onChange={handleChange}
            />
            {t('booking.emigration')}
          </label>

          {/* The four Ja/Nee boxes stay hidden until they mean something —
              on paper they are asked of everybody, and most people leave them
              blank because they do not apply. */}
          {form.emigration && (
            <div className={styles.subChecks}>
              {['id_present', 'deregistered', 'deregistration_present'].map((name) => (
                <label key={name} className={styles.check}>
                  <input
                    type="checkbox"
                    name={name}
                    checked={form[name]}
                    onChange={handleChange}
                  />
                  {t(`booking.${name}`)}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* 6 — insurance ---------------------------------------------- */}
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.insurance')}</legend>

          <label className={styles.check}>
            <input
              type="checkbox"
              name="insured"
              checked={form.insured}
              onChange={handleChange}
            />
            {t('booking.insured')}
          </label>

          {form.insured && (
            <label className={styles.field}>
              <span className={styles.label}>{t('booking.insuredValue')}</span>
              <div className={styles.money}>
                <span className={styles.moneySign} aria-hidden="true">€</span>
                <input
                  className={`${styles.input} ${styles.moneyInput}`}
                  type="number"
                  name="insured_value_eur"
                  min="0"
                  step="0.01"
                  value={form.insured_value_eur}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.insured_value_eur)}
                />
              </div>
              {errors.insured_value_eur && (
                <span className={styles.error}>{t(errors.insured_value_eur)}</span>
              )}
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.label}>{t('booking.notes')}</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              name="notes"
              rows={3}
              value={form.notes}
              onChange={handleChange}
            />
          </label>
        </fieldset>

        {/* 7 — terms and signature ------------------------------------ */}
        <fieldset className={`${styles.card} ${styles.terms}`}>
          <legend className={styles.legend}>{t('booking.sections.terms')}</legend>

          {/* Left in Dutch, word for word from the paper form. It is the
              clause the sender is agreeing to, and translating a contract is
              not something to do without being asked. */}
          <div className={styles.termsText} lang="nl">
            <p>
              <b>BELANGRIJK!</b> De afzender gaat akkoord met de algemene
              voorwaarden.
            </p>
            <p>
              CARIB INTERTRANS is niet verantwoordelijk voor de inhoud en waarde
              van de colli en kan op geen enkele wijze hiervoor aansprakelijk
              worden gesteld. De opgegeven waarde zal worden gebruikt door de
              douane voor berekening van de invoerrechten. U bent zelf
              verantwoordelijk voor deze waarde en indien de douane het niet eens
              is met de opgegeven waarde, zullen zij deze herzien. Het is
              strafbaar verboden items te transporteren.
            </p>
            <p>
              De afzender gaat ermee akkoord dat de goederen niet verzekerd zijn,
              tenzij tegen betaling een losse verzekering wordt afgesloten. Glas
              en geperst houten items altijd uitgesloten.
            </p>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              name="agreed_terms"
              checked={form.agreed_terms}
              onChange={handleChange}
              aria-invalid={Boolean(errors.agreed_terms)}
            />
            {t('booking.agree')}
          </label>
          {errors.agreed_terms && (
            <span className={styles.error}>{t(errors.agreed_terms)}</span>
          )}

          <label className={styles.field}>
            <span className={styles.label}>
              {t('booking.signature')}
              <span className={styles.required} aria-hidden="true"> *</span>
            </span>
            <input
              className={`${styles.input} ${styles.signature}`}
              type="text"
              name="signature_name"
              value={form.signature_name}
              onChange={handleChange}
              autoComplete="name"
              aria-invalid={Boolean(errors.signature_name)}
            />
            <span className={styles.hint}>{t('booking.signatureHint')}</span>
            {errors.signature_name && (
              <span className={styles.error}>{t(errors.signature_name)}</span>
            )}
          </label>
        </fieldset>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('booking.sending') : t('booking.submit')}
          </button>
          <p className={styles.officeNote}>{t('booking.officeNote')}</p>
        </div>
      </form>
    </main>
  );
}
