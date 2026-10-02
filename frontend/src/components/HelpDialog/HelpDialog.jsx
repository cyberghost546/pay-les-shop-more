// src/components/HelpDialog/HelpDialog.jsx
//
// A reusable help pop-up: a white window in the middle of the screen over a
// dark background, with a title, whatever content you put inside it, and a
// button to close it.
//
// It does not decide by itself when to open. The page that uses it keeps an
// `open` true/false value and passes it in, plus an `onClose` that sets it
// back to false. Example:
//
//   const [helpOpen, setHelpOpen] = useState(false);
//   <button onClick={() => setHelpOpen(true)}>Hoe werkt dit?</button>
//   <HelpDialog
//     open={helpOpen}
//     onClose={() => setHelpOpen(false)}
//     title="Zo werkt het"
//     closeLabel="Sluiten"
//     doneLabel="Begrepen"
//   >
//     <p>Uitleg hier…</p>
//   </HelpDialog>
//
// Used by the quote form (src/components/QuoteForm). The welcome pop-up for
// new visitors (src/components/WelcomeGuide) is a separate, bigger component
// because it has several pages and remembers whether it was seen.
//
// While open, the window: closes on Escape or a click on the dark background,
// takes keyboard focus (and gives it back on close), and stops the page
// behind it from scrolling.

import { useEffect, useId, useRef } from 'react';
import styles from './HelpDialog.module.css';

/**
 * @param {object} props
 * @param {boolean} props.open          whether the pop-up is showing
 * @param {() => void} props.onClose    called by every way of closing it
 * @param {string} props.title          the heading at the top
 * @param {string} props.closeLabel     screen-reader text for the × button
 * @param {string} props.doneLabel      text on the button at the bottom
 * @param {import('react').ReactNode} props.children  the explanation itself
 */
export default function HelpDialog({
  open,
  onClose,
  title,
  closeLabel,
  doneLabel,
  children,
}) {
  const dialogRef = useRef(null);
  // A unique id, so the window can point at its own title for screen readers
  // even if two of these are on the same page.
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    // Remember what had focus (usually the "Hoe werkt dit?" button) so it
    // gets focus back when the window closes.
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // The dark layer. Only a click on the layer itself closes the pop-up,
    // not a click inside the white window.
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={closeLabel}
        >
          ×
        </button>

        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>

        <div className={styles.content}>{children}</div>

        <div className={styles.actions}>
          <button type="button" className={styles.done} onClick={onClose}>
            {doneLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
