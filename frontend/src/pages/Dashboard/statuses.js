// src/pages/Dashboard/statuses.js
//
// Which badge colour each status gets. The tones are meanings rather than
// colours — see StatusBadge in ui.jsx — so a quote that has been declined and
// a package that was cancelled look alike without either page knowing what
// red is.

/** Nothing has happened yet and someone has to act. */
const ATTENTION = 'attention';
/** Under way; no action needed right now. */
const PROGRESS = 'progress';
/** Finished, successfully. */
const DONE = 'done';
/** Closed without completing. */
const OFF = 'off';

export const QUOTE_TONES = {
  new: ATTENTION,
  quoted: PROGRESS,
  accepted: DONE,
  declined: OFF,
};

export const PACKAGE_TONES = {
  quoted: ATTENTION,
  paid: ATTENTION,
  purchased: PROGRESS,
  in_transit: PROGRESS,
  arrived: PROGRESS,
  delivered: DONE,
  cancelled: OFF,
};

/**
 * The readable label for a status value.
 *
 * The API sends `status_display` with every row, so this is only for the
 * places that have a bare value and no row to read it from — a filter
 * dropdown, or a count keyed by status.
 *
 * @param {{value: string, label: string}[]} options
 */
export function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label ?? value;
}
