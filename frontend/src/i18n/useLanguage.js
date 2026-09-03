// src/i18n/useLanguage.js
//
// Kept in its own file so the module exporting the provider component only
// exports components — React Fast Refresh needs that separation.

import { useContext } from 'react';
import { LanguageContext } from './context';

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside a <LanguageProvider>');
  }

  return context;
}
