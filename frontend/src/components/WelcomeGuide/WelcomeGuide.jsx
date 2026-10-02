// src/components/WelcomeGuide/WelcomeGuide.jsx
//
// The welcome pop-up: the first time someone opens the website in a browser,
// a window in the middle of the screen explains how ordering works, one step
// per page, with "Next" / "Back" buttons and a "Skip" that is always there.
//
// HOW IT DECIDES WHETHER TO SHOW
//
//   - Only for visitors who are NOT signed in. Someone with an account has
//     already found their way; for them the robot in the corner (PageGuide)
//     does the explaining instead, and the two would otherwise pop up on top
//     of each other.
//   - Only once per browser. As soon as the window closes - by "Skip", the ×,
//     Escape, a click on the dark background or finishing the steps - a flag
//     is written to localStorage (SEEN_KEY below) and it never opens itself
//     again in that browser.
//   - Not on the tutorial page: that page is this same explanation at length.
//
// TO SEE IT AGAIN WHILE TESTING: open the browser's dev tools, go to
// Application > Local Storage, delete the "plsm.welcome.seen" entry and
// reload. (Or run localStorage.removeItem('plsm.welcome.seen') in the console.)
//
// WHERE THE TEXT COMES FROM
//
// The step titles and bodies are NOT written here. They are the same texts
// the tutorial page uses (tutorial.steps.* in src/i18n/translations.js), so
// changing a step there changes it in both places. The few words that belong
// only to this pop-up (title, "Skip", ...) live under welcome.* in the same
// file, in each language (nl, en, pap).
//
// TO ADD, REMOVE OR REORDER A STEP: edit the STEPS list just below. Each name
// must match a key under tutorial.steps in translations.js.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import RobotGuide from '../RobotGuide/RobotGuide';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { fill } from '../../i18n/fill';
import styles from './WelcomeGuide.module.css';

// The key in localStorage that remembers "this browser has seen the pop-up".
// Changing this name makes the pop-up show again for everyone, once - handy
// if the ordering process changes and returning visitors should see it anew.
export const SEEN_KEY = 'plsm.welcome.seen';

// How long to wait after the page loads before opening, in milliseconds. A
// short pause lets the visitor see the page first, so the pop-up does not
// feel like it is blocking the site.
const OPEN_DELAY = 1200;

// The steps shown, in order. Each is a key under tutorial.steps.
const STEPS = [
  'account',
  'quote',
  'order',
  'invoice',
  'announce',
  'warehouse',
  'track',
  'delivery',
];

// localStorage can throw (private windows, blocked site data). If it does we
// simply treat the pop-up as "not seen" / "could not remember" - the worst
// case is that the visitor sees it one more time, which is harmless.
function hasSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to do; see the note above hasSeen().
  }
}

export default function WelcomeGuide() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const { isAuthenticated, isChecking } = useAuth();

  const [open, setOpen] = useState(false);

  // Which page of the pop-up is showing. 0 is the welcome page; 1 to
  // STEPS.length are the steps themselves.
  const [page, setPage] = useState(0);

  // The window itself, so keyboard focus can be moved into it when it opens.
  const dialogRef = useRef(null);

  // Decide whether to open. Waits until the login check has finished
  // (isChecking), otherwise a signed-in customer would see the pop-up flash
  // up during the split second before the site knows who they are.
  useEffect(() => {
    if (isChecking || isAuthenticated) return undefined;
    if (pathname === '/tutorial') return undefined;
    if (hasSeen()) return undefined;

    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY);
    // If the visitor signs in or navigates before the timer fires, cancel it.
    return () => window.clearTimeout(timer);
  }, [isChecking, isAuthenticated, pathname]);

  // Every way of closing goes through here, so the "seen" flag is always
  // written - whichever button the visitor used.
  const close = useCallback(() => {
    rememberSeen();
    setOpen(false);
  }, []);

  // While the window is open:
  //   - Escape closes it, like every other overlay on the site.
  //   - Focus moves into it, so keyboard and screen-reader users land on it.
  //   - The page behind stops scrolling, so the wheel scrolls nothing hidden.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') close();
    }

    // Remember what had focus, to put it back when the window closes.
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
  }, [open, close]);

  if (!open) return null;

  const isWelcome = page === 0;
  const isLast = page === STEPS.length;
  // The step being shown, e.g. 'quote'. Undefined on the welcome page.
  const stepKey = STEPS[page - 1];

  // Some steps have an extra warning line ("note") and some do not. t()
  // returns the key itself when a text is missing, so compare against that.
  const notePath = `tutorial.steps.${stepKey}.note`;
  const note = stepKey && t(notePath) !== notePath ? t(notePath) : null;

  return (
    // The dark see-through layer over the whole page. Clicking it (but not
    // the window on top of it) closes the pop-up.
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-guide-title"
        // tabIndex -1 lets the window receive focus from code without
        // adding it to the Tab order.
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label={t('welcome.close')}
        >
          ×
        </button>

        {isWelcome ? (
          // ---- Page 0: the welcome ----
          <div className={styles.welcome}>
            <RobotGuide className={styles.robot} waving />
            <p className={styles.eyebrow}>{t('welcome.eyebrow')}</p>
            <h2 id="welcome-guide-title" className={styles.title}>
              {t('welcome.title')}
            </h2>
            <p className={styles.body}>{t('welcome.intro')}</p>
          </div>
        ) : (
          // ---- Pages 1..N: one ordering step each ----
          <div className={styles.step}>
            <p className={styles.eyebrow}>
              {fill(t('welcome.stepOf'), {
                current: page,
                total: STEPS.length,
              })}
            </p>
            <h2 id="welcome-guide-title" className={styles.title}>
              <span className={styles.number} aria-hidden="true">
                {page}
              </span>
              {t(`tutorial.steps.${stepKey}.title`)}
            </h2>
            <p className={styles.body}>{t(`tutorial.steps.${stepKey}.body`)}</p>
            {note && <p className={styles.note}>{note}</p>}
          </div>
        )}

        {/* The row of dots: one per step, the current one filled in.
            Decorative - the "Step 2 of 8" text above says the same thing. */}
        {!isWelcome && (
          <div className={styles.dots} aria-hidden="true">
            {STEPS.map((key, index) => (
              <span
                key={key}
                className={`${styles.dot} ${index + 1 === page ? styles.dotActive : ''}`}
              />
            ))}
          </div>
        )}

        <div className={styles.actions}>
          {isWelcome && (
            <>
              <button type="button" className={styles.secondary} onClick={close}>
                {t('welcome.skip')}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => setPage(1)}
              >
                {t('welcome.start')}
              </button>
            </>
          )}

          {!isWelcome && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setPage(page - 1)}
            >
              {t('tutorial.previous')}
            </button>
          )}

          {!isWelcome && !isLast && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => setPage(page + 1)}
            >
              {t('tutorial.next')}
            </button>
          )}

          {/* Last page: send them somewhere useful. Clicking a link also
              closes the pop-up (and marks it as seen). */}
          {isLast && (
            <>
              <Link to="/tutorial" className={styles.secondary} onClick={close}>
                {t('welcome.fullGuide')}
              </Link>
              <Link to="/signup" className={styles.primary} onClick={close}>
                {t('tutorial.steps.account.action')}
              </Link>
            </>
          )}
        </div>

        {/* "Skip" stays available on every step, quietly, under the buttons. */}
        {!isWelcome && !isLast && (
          <button type="button" className={styles.skip} onClick={close}>
            {t('welcome.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
