// src/pages/Warehouse/PackagingForm.jsx
//
// One tap for the material, a stepper for how much, and notes only when they
// matter. "Other" needs a note; the server insists as well.

import { useState } from 'react';
import { PACKAGING_TYPES, addPackaging, errorMessage, fieldError } from '../../api/warehouse';
import { useLanguage } from '../../i18n/useLanguage';
import { Message } from './opsUi';
import styles from './Ops.module.css';

/**
 * @param {{ shipment: object, onSaved: (answer: {packaging: object, shipment: object}) => void,
 *   initial?: object|null, onCancel?: (() => void)|null }} props
 *   initial: a record to start from, so adding to what is already on a
 *   package does not mean typing the same material out again
 */
export default function PackagingForm({ shipment, onSaved, initial = null, onCancel = null }) {
  const { t } = useLanguage();
  const [type, setType] = useState(initial?.packaging_type ?? '');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [clientError, setClientError] = useState('');

  const needsNotes = type === 'other';

  async function submit(event) {
    event.preventDefault();
    if (!type) {
      setClientError(t('dashboard.flow.packaging.chooseType'));
      return;
    }
    if (needsNotes && !notes.trim()) {
      setClientError(t('dashboard.flow.packaging.sayWhat'));
      return;
    }
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      setClientError(t('dashboard.flow.packaging.quantityRange'));
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
    (error ? errorMessage(error, undefined, t) : '');

  return (
    <form onSubmit={submit} noValidate>
      <Message tone="error">{clientError || serverMessage}</Message>

      <div className={styles.choices} role="radiogroup" aria-label={t('dashboard.flow.packaging.typeLabel')}>
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
            {t(`dashboard.flow.packaging.types.${option.value}`)}
          </button>
        ))}
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <span className={styles.label} id="packaging-quantity">
            {t('dashboard.flow.packaging.quantity')}
          </span>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepperButton}
              aria-label={t('dashboard.flow.packaging.less')}
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
              aria-label={t('dashboard.flow.packaging.more')}
              onClick={() => setQuantity((n) => Math.min(999, (Number(n) || 0) + 1))}
            >
              +
            </button>
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{needsNotes ? t('dashboard.flow.packaging.notesRequired') : t('dashboard.flow.packaging.notesOptional')}</span>
          <input
            className={styles.input}
            value={notes}
            maxLength={500}
            placeholder={needsNotes ? t('dashboard.flow.packaging.otherPlaceholder') : ''}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.buttonRow}>
        <button type="submit" className={styles.secondary} disabled={busy}>
          {busy ? t('dashboard.flow.common.saving') : t('dashboard.flow.packaging.add')}
        </button>
        {onCancel && (
          <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>
            {t('dashboard.flow.common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
