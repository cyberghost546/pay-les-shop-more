// src/i18n/fill.js

/**
 * Puts values into a translated sentence: fill('{count} items', { count: 3 }).
 * A placeholder with no value is left as written, so a gap is visible.
 *
 * @param {string} text
 * @param {Record<string, string|number>} values
 */
export function fill(text, values = {}) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined || values[key] === null ? match : String(values[key]),
  );
}
