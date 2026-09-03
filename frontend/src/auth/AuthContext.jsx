// src/auth/AuthContext.jsx
//
// Who is signed in, for the whole app. The session itself lives in an
// HttpOnly cookie the browser holds; this only mirrors what the server says
// about it, so it is never the authority — the API is.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
} from '../api/auth';
import { getProfile } from '../api/profile';
import { AuthContext } from './context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'checking' until the first profile request answers. Without this, the
  // route guard would bounce a signed-in visitor to the login page on every
  // refresh, before the session has been confirmed.
  const [state, setState] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    getProfile()
      .then((profile) => {
        if (cancelled) return;
        setUser(profile);
        setState('ready');
      })
      .catch(() => {
        // 403 here just means nobody is signed in — not an error worth
        // showing. Any other failure also leaves the app usable, logged out.
        if (cancelled) return;
        setUser(null);
        setState('ready');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    await apiSignIn(credentials);
    // Re-read rather than trusting the login response: one shape of user
    // object everywhere, built by the same mapper.
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  const signUp = useCallback(async (details) => {
    await apiSignUp(details);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } finally {
      // Clear locally even if the request failed: the visitor asked to be
      // logged out, and leaving the UI signed in would be worse.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isChecking: state === 'checking',
      signIn,
      signUp,
      signOut,
      // Lets the profile page push its saved changes back into the header.
      setUser,
    }),
    [user, state, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
