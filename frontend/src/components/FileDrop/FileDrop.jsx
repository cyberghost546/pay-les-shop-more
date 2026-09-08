// src/components/FileDrop/FileDrop.jsx
//
// The upload box: a button that opens the picker, and the same area as a drop
// target. Both routes end in the same callback, because dragging a file in and
// choosing one from a dialog are the same intention expressed two ways.

import { useId, useState } from 'react';
import styles from './FileDrop.module.css';

/**
 * @param {{
 *   label: string,
 *   hint?: string,
 *   accept?: string,
 *   optionalLabel?: string,
 *   busy?: boolean,
 *   disabled?: boolean,
 *   chooseLabel: string,
 *   dropLabel: string,
 *   busyLabel?: string,
 *   onFile: (file: File) => void,
 * }} props
 */
export default function FileDrop({
  label,
  hint,
  accept = 'application/pdf,image/jpeg,image/png',
  optionalLabel,
  busy = false,
  disabled = false,
  chooseLabel,
  dropLabel,
  busyLabel,
  onFile,
}) {
  const inputId = useId();
  const hintId = useId();
  // Whether a file is currently hovering over the box. Counted rather than
  // set to a boolean: dragging across a child element fires dragleave on the
  // parent, so a boolean flickers off halfway through the drag.
  const [depth, setDepth] = useState(0);

  const inert = busy || disabled;
  const dragging = depth > 0;

  function take(file) {
    if (file && !inert) onFile(file);
  }

  return (
    <div className={styles.field}>
      <p className={styles.label}>
        <span>{label}</span>
        {optionalLabel && (
          <span className={styles.optional}>({optionalLabel})</span>
        )}
      </p>

      {/* Not a <label> wrapping everything: the whole box is a drop target,
          and a label that large turns every stray click in it into a file
          dialog. The button inside is what opens the picker. */}
      <div
        className={[
          styles.zone,
          dragging ? styles.zoneDragging : '',
          inert ? styles.zoneInert : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragEnter={(event) => {
          event.preventDefault();
          setDepth((n) => n + 1);
        }}
        onDragOver={(event) => {
          // Without this the browser navigates to the file instead of
          // handing it over, which looks exactly like the page crashing.
          event.preventDefault();
        }}
        onDragLeave={() => setDepth((n) => Math.max(0, n - 1))}
        onDrop={(event) => {
          event.preventDefault();
          setDepth(0);
          take(event.dataTransfer.files?.[0]);
        }}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
          <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>

        <p className={styles.prompt}>
          {busy ? (
            busyLabel ?? chooseLabel
          ) : (
            <>
              {/* A real <label> for a real <input type="file">: it opens the
                  picker on click and on Enter, from the keyboard and from a
                  screen reader, which a <button> plus a ref would have to
                  reimplement and would get subtly wrong. */}
              <label className={styles.choose} htmlFor={inputId}>
                {chooseLabel}
              </label>{' '}
              {dropLabel}
            </>
          )}
        </p>

        {hint && (
          <p className={styles.hint} id={hintId}>
            {hint}
          </p>
        )}

        <input
          id={inputId}
          type="file"
          className={styles.input}
          accept={accept}
          disabled={inert}
          // The heading above is plain text, so the name lives here. The
          // visible "Choose a file" label is what opens the picker; letting
          // it name the input too would give it two names.
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            // Cleared first, or choosing the same file twice in a row fires
            // no change event the second time and nothing appears to happen.
            event.target.value = '';
            take(file);
          }}
        />
      </div>
    </div>
  );
}
