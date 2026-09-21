// The robot in the corner. The behaviour worth pinning down is when it opens
// itself, because that is the part that becomes an annoyance if it regresses:
// once per page for a signed-in account, never for a visitor who is signed
// out, and never again after "stop showing this automatically".
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import PageGuide from './PageGuide';

// The auth context is stubbed rather than provided: the real one fires a
// profile request on mount, which has nothing to do with what is tested here.
const auth = { user: null, isAuthenticated: false };

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => auth,
}));

function signedIn(id = 7) {
  auth.user = { id, name: 'Test Customer' };
  auth.isAuthenticated = true;
}

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('the page guide', () => {
  it('waits in the corner for a visitor who is not signed in', async () => {
    renderWithProviders(<PageGuide />, { route: '/' });

    const launcher = screen.getByRole('button', {
      name: 'Open the guide for this page',
    });
    expect(launcher).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();

    // Long enough that the auto-open timer would have fired.
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens on click, with the copy for the page it is on', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PageGuide />, { route: '/tracking' });

    await user.click(
      screen.getByRole('button', { name: 'Open the guide for this page' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Follow your shipment' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Enter your tracking code/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full guide' })).toHaveAttribute(
      'href',
      '/tutorial',
    );
  });

  it('introduces itself once to a signed-in account, then leaves it alone', async () => {
    signedIn();
    const { unmount } = renderWithProviders(<PageGuide />, { route: '/booking' });

    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: 'Register a shipment' }),
        ).toBeInTheDocument(),
      { timeout: 2500 },
    );

    unmount();

    // Same account, same page, second visit: the corner button and nothing
    // more.
    renderWithProviders(<PageGuide />, { route: '/booking' });
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(screen.queryByRole('heading', { name: 'Register a shipment' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open the guide for this page' }),
    ).toBeInTheDocument();
  });

  it('stops opening itself once the visitor says so', async () => {
    signedIn();
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<PageGuide />, { route: '/profile' });

    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Your account' })).toBeInTheDocument(),
      { timeout: 2500 },
    );

    await user.click(
      screen.getByRole('button', { name: 'Stop showing this automatically' }),
    );
    expect(screen.queryByRole('heading', { name: 'Your account' })).toBeNull();

    unmount();

    // A page this account has never seen, which would otherwise open.
    renderWithProviders(<PageGuide />, { route: '/services' });
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(screen.queryByRole('heading', { name: 'Our services' })).toBeNull();
  });

  it('renders nothing on a page it has nothing to say about', () => {
    signedIn();
    const { container } = renderWithProviders(<PageGuide />, { route: '/tutorial' });

    expect(container).toBeEmptyDOMElement();
  });
});
