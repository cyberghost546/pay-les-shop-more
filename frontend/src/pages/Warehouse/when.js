// src/pages/Warehouse/when.js

/** Today as YYYY-MM-DD in the device's own time zone. */
function localToday() {
  // sv-SE formats dates as ISO, which is the shape the API sends.
  return new Date().toLocaleDateString('sv-SE');
}

/**
 * "Wim · 09:27", or "Wim · 2026-09-12 09:27" when it was not today.
 *
 * @param {{ date?: string, time?: string, user?: {name: string}, worker?: {name: string} }} entry
 */
export function whoAndWhen(entry) {
  const when = entry.date && entry.date !== localToday() ? `${entry.date} ${entry.time}` : entry.time;
  return [entry.user?.name ?? entry.worker?.name, when].filter(Boolean).join(' · ');
}
