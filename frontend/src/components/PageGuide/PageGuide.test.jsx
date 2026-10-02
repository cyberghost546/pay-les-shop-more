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
import TutorialProvider from '../Tutorial/TutorialProvider';
import { COMPLETED_KEY, VERSION_KEY } from '../Tutorial/storage';
import { TUTORIAL_VERSION } from '../Tutorial/tutorialSteps';

// The panel's "Help" list starts the onboarding tour, so the guide needs the
// tour's provider around it, as it has in App.jsx. The tour is marked as
// done so that it does not open over these tests.
function renderGuide(route) {
  window.localStorage.setItem(COMPLETED_KEY, 'true');
  window.localStorage.setItem(VERSION_KEY, String(TUTORIAL_VERSION));
  return renderWithProviders(
    <TutorialProvider>
      <PageGuide />
    </TutorialProvider>,
    { route },
  );
}

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
    renderGuide('/');

    const launcher = screen.getByRole('button', {
      name: 'Open help and the guide for this page',
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
    renderGuide('/tracking');

    await user.click(
      screen.getByRole('button', { name: 'Open help and the guide for this page' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Follow your shipment' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Enter your tracking code/)).toBeInTheDocument();
    // The Help list sits under the explanation.
    expect(
      screen.getByRole('button', { name: /Tour this page/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /How to order/ })).toBeInTheDocument();
  });

  it('introduces itself once to a signed-in account, then leaves it alone', async () => {
    signedIn();
    const { unmount } = renderGuide('/booking');

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
    renderGuide('/booking');
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(screen.queryByRole('heading', { name: 'Register a shipment' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open help and the guide for this page' }),
    ).toBeInTheDocument();
  });

  it('stops opening itself once the visitor says so', async () => {
    signedIn();
    const user = userEvent.setup();
    const { unmount } = renderGuide('/profile');

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
    renderGuide('/services');
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(screen.queryByRole('heading', { name: 'Our services' })).toBeNull();
  });

  it('offers only Help on a page it has nothing to explain', async () => {
    signedIn();
    const user = userEvent.setup();
    renderGuide('/tutorial');

    await user.click(
      screen.getByRole('button', { name: 'Open help and the guide for this page' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Hi! How can I help?' }),
    ).toBeInTheDocument();
    // No page box, and so no "Read more" either.
    expect(screen.queryByRole('button', { name: /Read more/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Tour this page/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stop showing this automatically' }),
    ).toBeNull();
  });

  it('shows the page text short, with Read more for the rest', async () => {
    const user = userEvent.setup();
    renderGuide('/');

    await user.click(
      screen.getByRole('button', { name: 'Open help and the guide for this page' }),
    );
    // The tips under the text only show after "Read more".
    expect(screen.queryByText(/Open "Services"/)).toBeNull();
    const more = screen.getByRole('button', { name: /Read more/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);
    expect(screen.getByRole('button', { name: /Show less/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/Open "Services"/)).toBeInTheDocument();
  });

  it('starts the onboarding tour from the Help list', async () => {
    const user = userEvent.setup();
    renderGuide('/');

    await user.click(
      screen.getByRole('button', { name: 'Open help and the guide for this page' }),
    );
    await user.click(screen.getByRole('button', { name: /Tour this page/ }));

    // The panel closes and the tour opens at step 1.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
