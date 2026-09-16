// src/pages/Dashboard/PeopleFields.jsx
//
// The pieces the two people pages share. Customers and Workers list the same
// User rows from the same endpoint - one record seen from two sides - so the
// row's address block, the labelled inputs and the contact form are written
// once here and imported by both. What differs between the pages
// is which accounts they ask for and which columns they show, and that stays
// in the pages themselves.

import { useState } from 'react';
import styles from './Dashboard.module.css';

/** One address on its own lines, the way it would be written on a label. */
export function AddressLines({ address }) {
  return (
    <div className={styles.address}>
      {address.label && <span className={styles.addressLabel}>{address.label}</span>}
      <div>
        {address.street} {address.house_number}
      </div>
      <div className={styles.mutedCell}>
        {[address.postal_code, address.city].filter(Boolean).join(' ')}
        {address.city && ', '}
        {address.country_display}
      </div>
    </div>
  );
}

/**
 * The server's complaint about one field, if it made one.
 *
 * DRF answers a 400 with `{field: ["message", ...]}`, which the API client
 * hands over as `error.fields`. Showing it beside the input it belongs to is
 * the difference between "that change could not be saved" and "that e-mail
 * address is already in use".
 */
export function FieldError({ errors, name }) {
  const message = errors?.[name];
  if (!message) return null;

  return (
    <span className={styles.officeError}>
      {Array.isArray(message) ? message.join(' ') : String(message)}
    </span>
  );
}

/**
 * One labelled input inside an office box.
 *
 * @param {{ label: string, name: string, value: string,
 *           onChange: (value: string) => void, errors?: object,
 *           type?: string, options?: {value: string, label: string}[] }} props
 */
export function Field({ label, name, value, onChange, errors, type = 'text', options }) {
  return (
    <label className={styles.officeField}>
      <span className={styles.officeLabel}>{label}</span>
      {options ? (
        <select
          className={styles.officeInput}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={styles.officeInput}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError errors={errors} name={name} />
    </label>
  );
}

/**
 * The customer's contact details, as the office may correct them.
 *
 * These write to the same User row the customer sees on their own profile
 * page, so a fixed phone number is the one they read next time they open it.
 * The username is not here: it is what they type to sign in.
 */
export function ContactFields({ customer, onSave, busy, errors }) {
  const [draft, setDraft] = useState({
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    email: customer.email ?? '',
    phone_number: customer.phone_number ?? '',
  });

  const dirty = Object.entries(draft).some(
    ([field, value]) => String(customer[field] ?? '') !== String(value),
  );

  const set = (field) => (value) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return (
    <div className={styles.officeBox}>
      <p className={styles.officeHead}>Contact details</p>

      <div className={styles.officeGrid}>
        <Field
          label="First name"
          name="first_name"
          value={draft.first_name}
          onChange={set('first_name')}
          errors={errors}
        />
        <Field
          label="Surname"
          name="last_name"
          value={draft.last_name}
          onChange={set('last_name')}
          errors={errors}
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          value={draft.email}
          onChange={set('email')}
          errors={errors}
        />
        <Field
          label="Phone"
          name="phone_number"
          type="tel"
          value={draft.phone_number}
          onChange={set('phone_number')}
          errors={errors}
        />
      </div>

      <button
        type="button"
        className={styles.rowButton}
        disabled={!dirty || busy}
        onClick={() => onSave(draft)}
      >
        {busy ? 'Saving…' : 'Save details'}
      </button>
    </div>
  );
}
