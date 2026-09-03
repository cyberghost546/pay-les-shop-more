// src/i18n/LanguageContext.jsx
//
// Holds the active language and hands components a `t()` lookup. Wrapped around
// the app in main.jsx, so any component can call useLanguage() without props
// being threaded through every level.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  translations,
} from './translations';
import { LanguageContext } from './context';

const STORAGE_KEY = 'plsm.language';

const isSupported = (code) => LANGUAGES.some((lang) => lang.code === code);

// Order of preference: what the visitor picked last, then what their browser
// asks for, then Dutch.
function detectLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupported(stored)) return stored;
  } catch {
    // Private browsing and blocked site data both throw here; fall through.
  }

  const preferred = window.navigator?.languages ?? [];
  for (const tag of preferred) {
    // 'en-GB' and 'nl-NL' should match 'en' and 'nl'.
    const base = tag.toLowerCase().split('-')[0];
    if (isSupported(base)) return base;
    if (base === 'pap') return 'pap';
  }

  return DEFAULT_LANGUAGE;
}

// Walks 'contact.fields.name' down the tree. Falls back to Dutch when a key is
// missing from a translation, so a gap shows real copy rather than a raw key.
function lookup(dictionary, path) {
  return path
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), dictionary);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectLanguage);

  // Keep <html lang> honest: screen readers and translation tools rely on it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (!isSupported(code)) return;
    setLanguageState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Not being able to remember the choice is not worth breaking over.
    }
  }, []);

  const t = useCallback(
    (path) => {
      const value = lookup(translations[language], path);
      if (value !== undefined) return value;

      const fallback = lookup(translations[DEFAULT_LANGUAGE], path);
      if (fallback !== undefined) return fallback;

      // Surfacing the key beats rendering "undefined" in the page.
      return path;
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, languages: LANGUAGES }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}
