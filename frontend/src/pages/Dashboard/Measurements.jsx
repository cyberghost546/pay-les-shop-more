// src/pages/Dashboard/Measurements.jsx
//
// The measured lines on an intake sheet: so many items of one size and
// weight, a line each, with the totals worked out while somebody types.
//
// Built for a tape measure in one hand. The number boxes open the numeric
// keypad, a line is copied with one tap when the next box is the same as the
// last, and nothing is refused while typing - the warnings below a line say
// "that looks wrong" and leave the decision with the person holding the box.

import { INTAKE_PACKAGING } from '../../api/staff';
import { EMPTY_LINE, number, totalsFor } from './measure';
import styles from './Dashboard.module.css';

const DIMENSIONS = [
  ['length_cm', 'L'],
  ['width_cm', 'B'],
  ['height_cm', 'H'],
];

/**
 * "That looks wrong" for a line, or nothing. Typos, not rules: 1500 where
 * somebody meant 150, or a pallet that weighs less than the pallet does.
 */
function warningsFor(line) {
  const warnings = [];
  const sizes = DIMENSIONS.map(([field]) => number(line[field])).filter((v) => v !== null);
  const weight = number(line.weight_kg);

  if (sizes.some((size) => size > 300)) {
    warnings.push('A side over 3 metres - check it is in centimetres.');
  }
  if (sizes.some((size) => size > 0 && size < 1)) {
    warnings.push('A side under 1 cm - was that typed in metres?');
  }
  if (weight !== null && weight > 1500) {
    warnings.push('Over 1500 kg for one item - is that the weight of the whole line?');
  }
  if (line.packaging === 'pallet' && weight !== null && weight < 5) {
    warnings.push('A pallet under 5 kg - check the weight.');
  }

  return warnings;
}

function format(value, digits) {
  return value === null ? '—' : value.toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * @param {{ lines: object[], onChange: (lines: object[]) => void,
 *           freight: string, declaredWeight: string|null, disabled: boolean }} props
 */
export default function Measurements({ lines, onChange, freight, declaredWeight, disabled }) {
  const totals = totalsFor(lines);

  function update(index, field, value) {
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  function add() {
    onChange([...lines, { ...EMPTY_LINE }]);
  }

  // The commonest case on the floor: the next carton is the same as the last.
  function duplicate(index) {
    const copy = { ...lines[index], note: '' };
    onChange([...lines.slice(0, index + 1), copy, ...lines.slice(index + 1)]);
  }

  function remove(index) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.measureBlock}>
      {lines.length === 0 && (
        <p className={styles.intakeHint}>
          Nothing measured yet. Add a line per size: ten identical cartons are
          one line with 10 in front.
        </p>
      )}

      {lines.map((line, index) => {
        const warnings = warningsFor(line);

        return (
          // Position as the key: lines have no id until they are saved, and
          // the list is only ever edited here, in order.
          <div key={index} className={styles.measureLine}>
            <div className={styles.measureTop}>
              <label className={styles.measureQty}>
                <span className={styles.intakeLabel}>Aantal</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  className={styles.intakeInput}
                  value={line.quantity}
                  onChange={(event) => update(index, 'quantity', event.target.value)}
                />
              </label>

              <label className={styles.measureKind}>
                <span className={styles.intakeLabel}>Soort</span>
                <select
                  className={styles.intakeInput}
                  value={line.packaging}
                  onChange={(event) => update(index, 'packaging', event.target.value)}
                >
                  <option value="">—</option>
                  {INTAKE_PACKAGING.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.measureSizes}>
              {DIMENSIONS.map(([field, label]) => (
                <label key={field} className={styles.measureSize}>
                  <span className={styles.intakeLabel}>{label} (cm)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    className={styles.intakeInput}
                    value={line[field]}
                    onChange={(event) => update(index, field, event.target.value)}
                  />
                </label>
              ))}
              <label className={styles.measureSize}>
                <span className={styles.intakeLabel}>Kg per stuk</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className={styles.intakeInput}
                  value={line.weight_kg}
                  onChange={(event) => update(index, 'weight_kg', event.target.value)}
                />
              </label>
            </div>

            <input
              className={styles.intakeInput}
              value={line.note}
              onChange={(event) => update(index, 'note', event.target.value)}
              placeholder="Opmerking (optional)"
              aria-label="Opmerking"
            />

            {warnings.map((warning) => (
              <p key={warning} className={styles.measureWarning}>
                {warning}
              </p>
            ))}

            {!disabled && (
              <div className={styles.measureButtons}>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => duplicate(index)}
                >
                  Add another like this
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => remove(index)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!disabled && (
        <button type="button" className={styles.scanSecondary} onClick={add}>
          + Add a line
        </button>
      )}

      <div className={styles.measureTotals} aria-live="polite">
        <span>
          <strong>{totals.colli}</strong> colli
        </span>
        <span>
          <strong>{format(totals.volume, 3)}</strong> m³
        </span>
        <span>
          <strong>{format(totals.weight, 1)}</strong> kg
        </span>
        {/* Only where it changes the bill. By sea nobody charges on it, and a
            second weight on screen would only raise the question of which. */}
        {freight === 'air' && totals.volumetric !== null && (
          <span>
            <strong>{format(Math.max(totals.weight, totals.volumetric), 1)}</strong> kg
            chargeable (volume {format(totals.volumetric, 1)} kg)
          </span>
        )}
        {declaredWeight !== null && declaredWeight !== undefined && (
          <span className={styles.measureDeclared}>
            Declared on the shipment: {format(Number(declaredWeight), 1)} kg
          </span>
        )}
      </div>
    </div>
  );
}
