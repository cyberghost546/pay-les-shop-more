// src/components/LanguageSwitcher/LanguageMenu.jsx
//
// The language choice for the dashboards' top bars: one compact button
// showing the current flag and code, opening a short menu of languages by
// name. Same languages, flags and saved choice as the rail on the public site
// (LanguageSwitcher.jsx).

import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { useLanguage } from '../../i18n/useLanguage';
import { FlagCW, FlagGB, FlagNL } from './flags';
import styles from './LanguageMenu.module.css';

const FLAGS = { nl: FlagNL, en: FlagGB, pap: FlagCW };

function Flag({ code }) {
  const Drawn = FLAGS[code];
  return <span className={styles.flag}>{Drawn ? <Drawn /> : code.toUpperCase()}</span>;
}

export default function LanguageMenu() {
  const { language, setLanguage, languages, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapper, open, close);

  const current = languages.find((lang) => lang.code === language) ?? languages[0];

  return (
    <div className={styles.wrapper} ref={wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('language.choose')}: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag code={current.code} />
        <span className={styles.code}>{current.short}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="radiogroup" aria-label={t('language.choose')}>
          {languages.map((lang) => {
            const active = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={active}
                className={active ? `${styles.option} ${styles.optionActive}` : styles.option}
                onClick={() => {
                  setLanguage(lang.code);
                  close();
                }}
              >
                <Flag code={lang.code} />
                <span className={styles.optionLabel}>{lang.label}</span>
                {active && (
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
