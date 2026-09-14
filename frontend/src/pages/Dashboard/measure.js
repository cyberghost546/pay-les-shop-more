// src/pages/Dashboard/measure.js
//
// The arithmetic behind the measured lines on an intake sheet, apart from the
// component so it can be tested on its own and so Fast Refresh keeps working.

// Mirrors VOLUMETRIC_DIVISOR in backend/warehouse/models.py.
const VOLUMETRIC_DIVISOR = 6000;

export const EMPTY_LINE = {
  quantity: '1',
  packaging: '',
  length_cm: '',
  width_cm: '',
  height_cm: '',
  weight_kg: '',
  note: '',
};

/** A line from the API, as the form holds it: numbers become strings. */
export function toLine(line) {
  const draft = { ...EMPTY_LINE };
  for (const field of Object.keys(EMPTY_LINE)) {
    draft[field] = line[field] === null || line[field] === undefined ? '' : String(line[field]);
  }
  return draft;
}

/** A line as the API wants it: blanks go back as null, not as zero. */
export function toLinePayload(line) {
  const blankToNull = (value) => (String(value).trim() === '' ? null : value);

  return {
    quantity: Number(line.quantity) || 1,
    packaging: line.packaging,
    length_cm: blankToNull(line.length_cm),
    width_cm: blankToNull(line.width_cm),
    height_cm: blankToNull(line.height_cm),
    weight_kg: blankToNull(line.weight_kg),
    note: line.note,
  };
}

/** A typed box as a number, or null while it is blank or not a number yet. */
export function number(value) {
  const parsed = Number(String(value).replace(',', '.'));
  return String(value).trim() === '' || Number.isNaN(parsed) ? null : parsed;
}

export function isComplete(line) {
  return ['length_cm', 'width_cm', 'height_cm', 'weight_kg'].every(
    (field) => number(line[field]) !== null,
  );
}

/**
 * What the lines add up to, from the complete ones only - the same rule as
 * measurement_totals on the server, so the figure on screen is the figure in
 * the e-mail.
 */
export function totalsFor(lines) {
  const colli = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const complete = lines.filter(isComplete);

  if (complete.length === 0) return { colli, volume: null, weight: null, volumetric: null };

  let volume = 0;
  let weight = 0;
  let volumetric = 0;

  for (const line of complete) {
    const quantity = Number(line.quantity) || 0;
    const cm3 = number(line.length_cm) * number(line.width_cm) * number(line.height_cm);
    volume += (quantity * cm3) / 1_000_000;
    weight += quantity * number(line.weight_kg);
    volumetric += (quantity * cm3) / VOLUMETRIC_DIVISOR;
  }

  return { colli, volume, weight, volumetric };
}
