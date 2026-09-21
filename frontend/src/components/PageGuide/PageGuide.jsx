// src/components/PageGuide/PageGuide.jsx
//
// The robot from the tutorial, following the visitor around the site: on each
// page it can explain what that page is for and what to do on it, in the
// active language, read aloud if asked.
//
// Who it interrupts, and when, is the whole design of this thing:
//
//   - Signed in: it opens itself once per page, the first time that account
//     sees that page in this browser, and never again. That is the
//     introduction a new account gets, spread over the pages it visits
//     rather than dumped on it at sign-up.
//   - Signed out: it never opens itself. It waits in the corner as a button.
//   - "Do not show again" stops the opening for good, in this browser, on
//     every page and for every account. The button stays.
//
// The record is kept in localStorage rather than on the account, deliberately:
// it is a preference about this browser, it is worth nothing to the server,
// and a blocked or cleared store costs the visitor one extra pop-up rather
// than an error. Private windows throw on both read and write, so both are
// wrapped.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import RobotGuide from '../RobotGuide/RobotGuide';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useSpeech } from '../../hooks/useSpeech';
import styles from './PageGuide.module.css';

const OFF_KEY = 'plsm.guide.off';
const SEEN_KEY = 'plsm.guide.seen';

// Which entry in guide.pages belongs to which route. Longest path first: a
// destination page must match before the index it sits under.
const PAGES = [
  { match: (path) => path === '/', key: 'home' },
  { match: (path) => path === '/services', key: 'services' },
  { match: (path) => path === '/booking', key: 'booking' },
  { match: (path) => path === '/tracking', key: 'tracking' },
  { match: (path) => path === '/contact', key: 'contact' },
  { match: (path) => path.startsWith('/destinations/'), key: 'destination' },
  { match: (path) => path === '/destinations', key: 'destinations' },
  { match: (path) => path === '/profile', key: 'profile' },
  { match: (path) => path === '/login', key: 'login' },
  { match: (path) => path === '/signup', key: 'signup' },
];

// The guide has nothing to add on the tutorial page — that page is the same
// copy at length — and the 404 and password-reset pages are not somewhere to
// be taught anything.
function pageKeyFor(pathname) {
  return PAGES.find((page) => page.match(pathname))?.key ?? null;
}

function readOff() {
  try {
    return window.localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** The page keys this account has already been shown, in this browser. */
function readSeen(userId) {
  if (!userId) return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}');
    const seen = stored?.[String(userId)];
    return Array.isArray(seen) ? seen : [];
  } catch {
    return [];
  }
}

function rememberSeen(userId, key) {
  if (!userId) return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}');
    const forUser = Array.isArray(stored?.[String(userId)])
      ? stored[String(userId)]
      : [];
    if (forUser.includes(key)) return;
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ ...stored, [String(userId)]: [...forUser, key] }),
    );
  } catch {
    // Nothing to do: the guide opens once more next time, which is harmless.
  }
}

export default function PageGuide() {
  const { pathname } = useLocation();
  const { t, language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { supported, speaking, speak, stop } = useSpeech(language);

  const [open, setOpen] = useState(false);
  const [off, setOff] = useState(readOff);

  const pageKey = pageKeyFor(pathname);
  const userId = user?.id ?? null;

  const title = pageKey ? t(`guide.pages.${pageKey}.title`) : '';
  const body = pageKey ? t(`guide.pages.${pageKey}.body`) : '';
  const bulletsValue = pageKey ? t(`guide.pages.${pageKey}.bullets`) : null;
  const bullets = useMemo(
    () => (Array.isArray(bulletsValue) ? bulletsValue : []),
    [bulletsValue],
  );

  // The one time it opens itself. A short delay so it arrives after the page
  // has painted rather than on top of it.
  //
  // Nothing here has to close it again on the way out: App keys this
  // component on the path, so a new page gets a fresh, closed guide and
  // useSpeech silences the old one as it unmounts.
  useEffect(() => {
    if (!pageKey || off || !isAuthenticated || !userId) return undefined;
    if (readSeen(userId).includes(pageKey)) return undefined;

    const timer = window.setTimeout(() => {
      rememberSeen(userId, pageKey);
      setOpen(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [pageKey, off, isAuthenticated, userId]);

  const close = useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  // Escape closes it, as it does the menu and every other overlay here.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') close();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  function toggleVoice() {
    if (speaking) {
      stop();
      return;
    }
    speak([title, body, ...bullets].join('. '));
  }

  function silence() {
    try {
      window.localStorage.setItem(OFF_KEY, '1');
    } catch {
      // Then it opens itself again next visit. Not worth an error message.
    }
    setOff(true);
    close();
  }

  // Nothing sensible to say about this route.
  if (!pageKey) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={styles.launcher}
        onClick={() => {
          if (userId) rememberSeen(userId, pageKey);
          setOpen(true);
        }}
        aria-label={t('guide.openLabel')}
        title={t('guide.openLabel')}
      >
        <RobotGuide className={styles.launcherRobot} />
      </button>
    );
  }

  return (
    <aside className={styles.panel} aria-label={t('guide.panelLabel')}>
      <div className={styles.head}>
        <RobotGuide className={styles.panelRobot} speaking={speaking} />
        <div>
          <p className={styles.eyebrow}>{t('guide.eyebrow')}</p>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label={t('guide.close')}
        >
          ×
        </button>
      </div>

      <p className={styles.body}>{body}</p>

      {bullets.length > 0 && (
        <ul className={styles.bullets}>
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        {supported && (
          <button
            type="button"
            className={`${styles.button} ${speaking ? styles.listening : ''}`}
            onClick={toggleVoice}
            aria-pressed={speaking}
          >
            <span aria-hidden="true">{speaking ? '🔊' : '🔈'}</span>{' '}
            {speaking ? t('guide.stop') : t('guide.listen')}
          </button>
        )}

        <Link to="/tutorial" className={styles.link} onClick={close}>
          {t('guide.full')}
        </Link>
      </div>

      <button type="button" className={styles.dismiss} onClick={silence}>
        {t('guide.dontShow')}
      </button>
    </aside>
  );
}
