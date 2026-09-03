// src/auth/context.js
//
// The context object alone, so AuthContext.jsx exports nothing but a
// component and React Fast Refresh can hot-reload it.

import { createContext } from 'react';

export const AuthContext = createContext(null);
