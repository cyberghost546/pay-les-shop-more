// src/pages/Warehouse/waited.js

/** "3 days", "5 hours": how long ago `since` was, for "in this stage for …". */
export function waitedFor(since, now = Date.now()) {
  if (!since) return '';
  const hours = Math.max(0, (now - new Date(since).getTime()) / 3_600_000);
  if (hours < 1) return 'less than an hour';
  if (hours < 48) {
    const whole = Math.floor(hours);
    return `${whole} hour${whole === 1 ? '' : 's'}`;
  }
  return `${Math.floor(hours / 24)} days`;
}
