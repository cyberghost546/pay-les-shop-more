// src/components/LanguageSwitcher/LanguageSwitcher.jsx
import { useLanguage } from '../../i18n/useLanguage';
import styles from './LanguageSwitcher.module.css';

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

        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            // The full name is announced; only the short code is drawn.
            aria-label={lang.label}
            title={lang.label}
            className={active ? `${styles.circle} ${styles.active}` : styles.circle}
            onClick={() => setLanguage(lang.code)}
          >
            {lang.short}
          </button>
        );
      })}
    </nav>
  );
}
