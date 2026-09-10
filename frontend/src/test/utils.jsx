// Rendering helpers.
//
// Every component worth testing here sits inside at least one provider: the
// language context supplies t(), the router supplies links, and anything that
// knows about the signed-in user needs the auth context. Rendering one bare
// throws, so the helper is what makes the tests read like the app.

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { LanguageProvider } from '../i18n/LanguageContext';

/**
 * @param ui       the element under test
 * @param options  `route` seeds the router's history; `withAuth` adds the auth
 *                 provider, which is off by default because it fires a profile
 *                 request on mount that most tests have no reason to stub.
 */
export function renderWithProviders(
  ui,
  { route = '/', withAuth = false, ...options } = {},
) {
  function Wrapper({ children }) {
    const withRouter = (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    );

    return (
      <LanguageProvider>
        {withAuth ? <AuthProvider>{withRouter}</AuthProvider> : withRouter}
      </LanguageProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
