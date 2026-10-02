// The welcome pop-up. What matters most is WHEN it opens, because getting
// that wrong turns a helpful pop-up into an annoying one: once per browser,
// only for visitors who are signed out, never on the tutorial page.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import WelcomeGuide, { SEEN_KEY } from './WelcomeGuide';

// The auth context is stubbed: the real one makes a network request on mount.
const auth = { user: null, isAuthenticated: false, isChecking: false };

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  auth.isChecking = false;
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// Long enough for the open delay to have passed.
const waitPastDelay = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });

describe('the welcome pop-up', () => {
  it('opens for a first-time visitor who is signed out', async () => {
    renderWithProviders(<WelcomeGuide />, { route: '/' });

    expect(await screen.findByRole('dialog', {}, { timeout: 2500 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Welcome to Pay Less Shop More' }),
    ).toBeInTheDocument();
  });

  it('walks through the steps with Next and Back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WelcomeGuide />, { route: '/' });
    await screen.findByRole('dialog', {}, { timeout: 2500 });

    await user.click(screen.getByRole('button', { name: 'Show me how it works' }));
    expect(screen.getByText('Step 1 of 8')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Create an account/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 8')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 8')).toBeInTheDocument();
  });

  it('closes on Skip and does not open again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<WelcomeGuide />, { route: '/' });
    await screen.findByRole('dialog', {}, { timeout: 2500 });

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe('1');

    // A later visit in the same browser.
    unmount();
    renderWithProviders(<WelcomeGuide />, { route: '/' });
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WelcomeGuide />, { route: '/' });
    await screen.findByRole('dialog', {}, { timeout: 2500 });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('never opens for a signed-in customer', async () => {
    auth.user = { id: 7 };
    auth.isAuthenticated = true;
    renderWithProviders(<WelcomeGuide />, { route: '/' });

    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open on the tutorial page', async () => {
    renderWithProviders(<WelcomeGuide />, { route: '/tutorial' });

    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
