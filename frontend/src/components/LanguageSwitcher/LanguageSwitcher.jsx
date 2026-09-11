// src/components/LanguageSwitcher/LanguageSwitcher.jsx
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
 * Fixed rail of circular language buttons on the right edge of every page.
 * Rendered once from App, outside the routed content, so it stays put while
 * pages change underneath it.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage, languages, t } = useLanguage();

  return (
    // A radio group rather than a <select>: three options are worth showing at
    // a glance, and it reads as one control to a screen reader.
    <nav
      className={styles.rail}
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
            onClick={() => setLanguage(lang.code)}
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
