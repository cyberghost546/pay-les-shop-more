// src/components/LanguageSwitcher/LanguageSwitcher.jsx
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import { FlagCW, FlagGB, FlagNL } from './flags';
import styles from './LanguageSwitcher.module.css';

// Which flag goes with which language code. Kept here rather than beside the
// flags themselves because flags.jsx exports components and nothing else,
// which is what lets React hot-reload it while somebody is drawing one.
const FLAGS = {
  nl: FlagNL,
  en: FlagGB,
  pap: FlagCW,
};

/**
 * Fixed language control on the right edge of every page. Rendered once from
 * App, outside the routed content, so it stays put while pages change
 * underneath it.
 *
 * Folded away it is just the flag of the language in use, so it covers as
 * little of the page as it can. Tapping that flag opens the rail of all the
 * languages; choosing one, tapping outside or pressing Escape folds it again.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage, languages, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const railRef = useRef(null);
  const toggleRef = useRef(null);

  // Open: a tap anywhere else, or Escape, folds the rail away again.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!railRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        // Focus would otherwise be lost with the button that had it.
        requestAnimationFrame(() => toggleRef.current?.focus());
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = languages.find((lang) => lang.code === language);
  const CurrentFlag = FLAGS[language];

  if (!open) {
    return (
      <div className={`${styles.rail} ${styles.folded}`}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded="false"
          aria-label={`${t('language.choose')}: ${current?.label ?? language}`}
          title={t('language.choose')}
          className={`${styles.circle} ${styles.active}`}
          onClick={() => setOpen(true)}
        >
          {CurrentFlag ? <CurrentFlag /> : current?.short}
        </button>
      </div>
    );
  }

  return (
    // A radio group rather than a <select>: three options are worth showing at
    // a glance, and it reads as one control to a screen reader.
    <nav
      ref={railRef}
      className={`${styles.rail} ${styles.opened}`}
      role="radiogroup"
      aria-label={t('language.choose')}
    >
      {languages.map((lang) => {
        const active = lang.code === language;
        const Flag = FLAGS[lang.code];

        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            // The full name is announced and shown on hover; only the flag is
            // drawn. That split is what makes a flag usable here at all - it
            // stands for the language on a rail too small for a word, and the
            // word is a keyboard focus or a hover away for anybody it does not
            // tell.
            aria-label={lang.label}
            title={lang.label}
            className={active ? `${styles.circle} ${styles.active}` : styles.circle}
            // Keyboard users land on the language in use, as they would in
            // any radio group.
            autoFocus={active}
            onClick={() => {
              setLanguage(lang.code);
              setOpen(false);
            }}
          >
            {/* The code is the fallback for a language added later with no
                flag drawn for it yet, which keeps the rail working rather than
                leaving an empty circle. */}
            {Flag ? <Flag /> : lang.short}
          </button>
        );
      })}
    </nav>
  );
}
