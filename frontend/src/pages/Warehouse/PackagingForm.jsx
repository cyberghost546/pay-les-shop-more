// src/pages/Warehouse/PackagingForm.jsx
//
// One tap for the material, a stepper for how much, and notes only when they
// matter. "Other" needs a note; the server insists as well.

import { useState } from 'react';
import { PACKAGING_TYPES, addPackaging, errorMessage, fieldError } from '../../api/warehouse';
import { Message } from './opsUi';
import styles from './Ops.module.css';

/**
 * @param {{ shipment: object, onSaved: (answer: {packaging: object, shipment: object}) => void }} props
 */
export default function PackagingForm({ shipment, onSaved }) {
  const [type, setType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [clientError, setClientError] = useState('');

  const needsNotes = type === 'other';

  async function submit(event) {
    event.preventDefault();
    if (!type) {
      setClientError('Choose the packaging you used.');
      return;
    }
    if (needsNotes && !notes.trim()) {
      setClientError('Say what packaging was used.');
      return;
    }
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      setClientError('Quantity must be a whole number from 1 to 999.');
      return;
    }

    setBusy(true);
    setError(null);
    setClientError('');
    try {
      const answer = await addPackaging(shipment.id, {
        packaging_type: type,
        quantity: count,
        notes: notes.trim(),
      });
      setType('');
      setQuantity(1);
      setNotes('');
      onSaved(answer);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const serverMessage =
    fieldError(error, 'packaging_type') ||
    fieldError(error, 'quantity') ||
    fieldError(error, 'notes') ||
    (error ? errorMessage(error) : '');

  return (
    <form onSubmit={submit} noValidate>
      <Message tone="error">{clientError || serverMessage}</Message>

      <div className={styles.choices} role="radiogroup" aria-label="Packaging type">
        {PACKAGING_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={type === option.value}
            className={`${styles.choice} ${type === option.value ? styles.choiceOn : ''}`}
            onClick={() => {
              setType(option.value);
              setClientError('');
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <span className={styles.label} id="packaging-quantity">
            Quantity
          </span>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepperButton}
              aria-label="One less"
              onClick={() => setQuantity((n) => Math.max(1, Number(n) - 1 || 1))}
            >
              −
            </button>
            <input
              className={`${styles.input} ${styles.number}`}
              aria-labelledby="packaging-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, '').slice(0, 3))}
            />
            <button
              type="button"
              className={styles.stepperButton}
              aria-label="One more"
              onClick={() => setQuantity((n) => Math.min(999, (Number(n) || 0) + 1))}
            >
              +
            </button>
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Notes{needsNotes ? ' (required)' : ' (optional)'}</span>
          <input
            className={styles.input}
            value={notes}
            maxLength={500}
            placeholder={needsNotes ? 'What did you use?' : ''}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>

      <button type="submit" className={`${styles.secondary} ${styles.wide}`} disabled={busy}>
        {busy ? 'Saving…' : 'Add packaging'}
      </button>
    </form>
  );
}
