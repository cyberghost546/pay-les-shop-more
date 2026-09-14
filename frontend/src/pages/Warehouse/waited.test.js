import { describe, expect, it } from 'vitest';
import { waitedFor } from './waited';

const NOW = new Date('2026-09-14T12:00:00Z').getTime();
const ago = (hours) => new Date(NOW - hours * 3_600_000).toISOString();

describe('waitedFor', () => {
  it('says less than an hour for something just moved', () => {
    expect(waitedFor(ago(0.2), NOW)).toBe('less than an hour');
  });

  it('counts hours for the first two days', () => {
    expect(waitedFor(ago(1), NOW)).toBe('1 hour');
    expect(waitedFor(ago(30), NOW)).toBe('30 hours');
  });

  it('counts days after that', () => {
    expect(waitedFor(ago(24 * 4 + 3), NOW)).toBe('4 days');
  });

  it('is blank without a time', () => {
    expect(waitedFor(null, NOW)).toBe('');
  });
});
