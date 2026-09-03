// src/i18n/context.js
//
// The context object alone. It lives apart from the provider so that
// LanguageContext.jsx exports nothing but a component, which is what React
// Fast Refresh needs to hot-reload it during development.

import { createContext } from 'react';

export const LanguageContext = createContext(null);
