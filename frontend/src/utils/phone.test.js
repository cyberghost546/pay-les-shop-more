// src/utils/phone.test.js
import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN, sanitizePhone } from './phone';

describe('sanitizePhone', () => {
  it('drops letters, which is the whole point', () => {
    expect(sanitizePhone('wfdwqr1241251')).toBe('1241251');
  });

  it('keeps the punctuation people write numbers with', () => {
    expect(sanitizePhone('+599 (9) 461-1234')).toBe('+599 (9) 461-1234');
  });

  it('keeps a + only where it means a country code', () => {
    expect(sanitizePhone('+5999461')).toBe('+5999461');
    expect(sanitizePhone('599+9461')).toBe('5999461');
    expect(sanitizePhone('++5999461')).toBe('+5999461');
  });

  it('drops symbols that are not part of a number', () => {
    expect(sanitizePhone('59/9*946#1')).toBe('5999461');
  });

  it('leaves an empty field empty', () => {
    expect(sanitizePhone('')).toBe('');
  });

  it('produces something the submit-time check accepts', () => {
    expect(PHONE_PATTERN.test(sanitizePhone('tel: +599 9 461 1234'))).toBe(true);
  });

  it('still leaves too-short input to fail validation', () => {
    // Sanitising is not validating: four digits are all legal characters.
    expect(PHONE_PATTERN.test(sanitizePhone('1234'))).toBe(false);
  });
});
