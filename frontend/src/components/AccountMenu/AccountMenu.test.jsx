import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import AccountMenu from './AccountMenu';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Wim Vloer', email: 'wim@example.com', role: 'warehouse' },
  }),
}));

function renderMenu(onSignOut = vi.fn()) {
  renderWithProviders(
    <AccountMenu
      links={[{ to: '/warehouse/profile', label: 'Profile' }]}
      signOutLabel="Sign out"
      onSignOut={onSignOut}
    />,
  );
  return onSignOut;
}

describe('AccountMenu', () => {
  it('shows initials, name and role, and opens a menu of links', async () => {
    renderMenu();
    const button = screen.getByRole('button', { name: /Wim Vloer/ });

    expect(button).toHaveTextContent('WV');
    expect(button).toHaveTextContent('Warehouse worker');
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/warehouse/profile');
  });

  it('closes on Escape and signs out from the menu', async () => {
    const onSignOut = renderMenu();
    const button = screen.getByRole('button', { name: /Wim Vloer/ });

    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();

    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
