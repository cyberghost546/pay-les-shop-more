// src/components/LanguageSwitcher/LanguageMenu.jsx
//
// The language choice as a small inline row of flags, for the dashboards' top
// bars. Same languages, flags and saved choice as the rail on the public site
// (LanguageSwitcher.jsx); only the size and placement differ.

import { useLanguage } from '../../i18n/useLanguage';
import { FlagCW, FlagGB, FlagNL } from './flags';
import styles from './LanguageMenu.module.css';

const FLAGS = { nl: FlagNL, en: FlagGB, pap: FlagCW };

export default function LanguageMenu() {
  const { language, setLanguage, languages, t } = useLanguage();

  return (
    <div className={styles.menu} role="radiogroup" aria-label={t('language.choose')}>
      {languages.map((lang) => {
        const active = lang.code === language;
        const Flag = FLAGS[lang.code];
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={lang.label}
            title={lang.label}
            className={active ? `${styles.flag} ${styles.active}` : styles.flag}
            onClick={() => setLanguage(lang.code)}
          >
            {Flag ? <Flag /> : lang.short}
          </button>
        );
      })}
    </div>
  );
}
