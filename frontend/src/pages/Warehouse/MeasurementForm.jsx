// src/pages/Warehouse/MeasurementForm.jsx
//
// Four numbers, typed fast. Weight is focused on arrival; Enter (or the
// keyboard's Next key) moves to the next box, and Enter on the last one
// saves. Volume and dimensional weight appear as soon as the sides are in.
// The worker's name is never asked for - the server takes it from the
// signed-in account.

import { useEffect, useRef, useState } from 'react';
import { MEASUREMENT_LIMITS, errorMessage, fieldError, saveMeasurement } from '../../api/warehouse';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { MEASUREMENT_FIELDS, derived, toPayload, validateMeasurement } from './measurement';
import { Message } from './opsUi';
import styles from './Ops.module.css';

const EMPTY = { weight_kg: '', length_cm: '', width_cm: '', height_cm: '' };

/** An existing measurement as text in the four boxes, so it can be corrected. */
function startingValues(initial) {
  if (!initial) return EMPTY;
  return Object.fromEntries(
    MEASUREMENT_FIELDS.map((field) => {
      const value = initial[field];
      const blank = value === null || value === undefined || value === '';
      return [field, blank ? '' : String(Number(value))];
    }),
  );
}

function formatNumber(value, digits) {
  if (value === null) return '—';
  return value.toLocaleString('nl-NL', { maximumFractionDigits: digits });
}

/**
 * @param {{ shipment: object, onSaved: (answer: {measurement: object, shipment: object}) => void,
 *   autoFocus?: boolean, initial?: object|null, onCancel?: (() => void)|null }} props
 */
export default function MeasurementForm({
  shipment,
  onSaved,
  autoFocus = true,
  initial = null,
  onCancel = null,
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState(() => startingValues(initial));
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef({});

  useEffect(() => {
    if (autoFocus) inputs.current.weight_kg?.focus();
  }, [autoFocus]);

  const errors = validateMeasurement(values, t);
  const figures = derived(values);
  const current = shipment.measurement;

  function set(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setServerError(null);
  }

  function focusNext(field) {
    const index = MEASUREMENT_FIELDS.indexOf(field);
    const next = MEASUREMENT_FIELDS[index + 1];
    if (next) inputs.current[next]?.focus();
  }

  async function submit(event) {
    event?.preventDefault();
    setTouched(Object.fromEntries(MEASUREMENT_FIELDS.map((field) => [field, true])));

    const firstBad = MEASUREMENT_FIELDS.find((field) => errors[field]);
    if (firstBad) {
      inputs.current[firstBad]?.focus();
      return;
    }

    setBusy(true);
    setServerError(null);
    try {
      const answer = await saveMeasurement(shipment.id, toPayload(values));
      setValues(EMPTY);
      setTouched({});
      onSaved(answer);
    } catch (error) {
      setServerError(error);
      const badField = MEASUREMENT_FIELDS.find((field) => fieldError(error, field));
      if (badField) inputs.current[badField]?.focus();
    } finally {
      setBusy(false);
    }
  }

  const generalError =
    serverError && !MEASUREMENT_FIELDS.some((field) => fieldError(serverError, field))
      ? errorMessage(serverError, t('dashboard.flow.measure.saveError'), t)
      : '';

  return (
    <form onSubmit={submit} noValidate>
      {current && (
        <Message tone="info">
          {fill(t('dashboard.flow.measure.current'), {
            weight: Number(current.weight_kg),
            length: Number(current.length_cm),
            width: Number(current.width_cm),
            height: Number(current.height_cm),
            name: current.worker?.name ?? '',
          })}
        </Message>
      )}
      <Message tone="error">{generalError}</Message>

      <div className={styles.fields}>
        {MEASUREMENT_FIELDS.map((field, index) => {
          const limits = MEASUREMENT_LIMITS[field];
          const message = fieldError(serverError, field) || (touched[field] ? errors[field] : '');
          const last = index === MEASUREMENT_FIELDS.length - 1;
          return (
            <label key={field} className={styles.field}>
              <span className={styles.label}>
                {t(`dashboard.flow.measure.fields.${field}`)} ({limits.unit})
              </span>
              <span className={styles.inputWrap}>
                <input
                  ref={(element) => {
                    inputs.current[field] = element;
                  }}
                  className={`${styles.input} ${styles.number} ${message ? styles.inputInvalid : ''}`}
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint={last ? 'done' : 'next'}
                  value={values[field]}
                  aria-invalid={Boolean(message)}
                  onChange={(event) => set(field, event.target.value)}
                  onBlur={() => setTouched((previous) => ({ ...previous, [field]: true }))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    if (last) submit();
                    else focusNext(field);
                  }}
                />
                <span className={styles.unit}>{limits.unit}</span>
              </span>
              {message && <span className={styles.fieldError}>{message}</span>}
            </label>
          );
        })}
      </div>

      <dl className={styles.results} aria-live="polite">
        <div className={styles.result}>
          <dt>{t('dashboard.flow.measure.volume')}</dt>
          <dd>{formatNumber(figures.volumeM3, 4)} m³</dd>
        </div>
        <div className={styles.result}>
          <dt>{t('dashboard.flow.measure.dimensional')}</dt>
          <dd>{formatNumber(figures.dimensionalWeightKg, 2)} kg</dd>
        </div>
        <div className={styles.result}>
          <dt>{t('dashboard.flow.measure.chargeable')}</dt>
          <dd>{formatNumber(figures.chargeableKg, 2)} kg</dd>
        </div>
      </dl>

      <div className={styles.buttonRow}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy
            ? t('dashboard.flow.common.saving')
            : current
              ? t('dashboard.flow.measure.saveUpdate')
              : t('dashboard.flow.measure.save')}
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
