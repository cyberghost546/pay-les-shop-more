// If the tour breaks, the website must carry on. Here a step is made to
// throw: the tour should vanish and the page around it stay usable.
// In its own file because the crash is set up with a module mock, which
// would otherwise affect every other tour test.

import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import TutorialProvider from './TutorialProvider';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isChecking: false }),
}));

vi.mock('./TutorialStep', () => ({
  default: () => {
    throw new Error('Broken step');
  },
}));

describe('when the tour crashes', () => {
  it('disappears and leaves the page working', async () => {
    // The error is expected; keep it out of the test output.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(
      <TutorialProvider>
        <button type="button">A button on the page</button>
      </TutorialProvider>,
    );

    // Give it time to open (and crash).
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'A button on the page' })).toBeEnabled();
  });
});
