// src/utils/phone.js
//
// One definition of what a phone number may contain, shared by every form
// that asks for one. It lived in the signup page alone, which is how the
// profile page ended up accepting anything at all.

// Digits, spaces, dashes, brackets and one optional leading +. Numbers are
// written a dozen different ways across the islands and the Netherlands, so
// this only checks the shape is plausible — the count of digits is the part
// worth enforcing.
export const PHONE_PATTERN = /^\+?[\d\s()-]{7,}$/;

const ALLOWED = /[\d\s()-]/;

/**
 * Drops anything that cannot appear in a phone number, so letters never reach
 * the field in the first place.
 *
 * Rejecting on submit was already happening, but only after the visitor had
 * filled in the whole form and pressed the button — by which point the
 * mistake is several fields behind them. Refusing the keystroke says the same
 * thing at the moment it is useful.
 *
 * A + is kept only in the leading position, where it means a country code.
 * Anywhere else it is punctuation nobody intended.
 *
 * @param {string} value the raw field value
 * @returns {string} the value with every disallowed character removed
 */
export function sanitizePhone(value) {
  let result = '';

  for (const character of value) {
    if (character === '+') {
      // Leading only, and only one: a + after any other character is noise.
      if (result === '') result = '+';
      continue;
    }
    if (ALLOWED.test(character)) result += character;
  }

  return result;
}
