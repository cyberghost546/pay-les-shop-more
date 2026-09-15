import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useLanguage } from '../../i18n/useLanguage';
import { renderWithProviders } from '../../test/utils';
import LanguageMenu from './LanguageMenu';

function Greeting() {
  const { t } = useLanguage();
  return <p>{t('dashboard.warehouse.nav.packages')}</p>;
}

describe('LanguageMenu', () => {
  it('switches the dashboard language and remembers it', async () => {
    renderWithProviders(
      <>
        <LanguageMenu />
        <Greeting />
      </>,
    );
    expect(screen.getByText('Packages')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /English/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Nederlands/ }));

    expect(screen.getByText('Pakketten')).toBeInTheDocument();
    expect(window.localStorage.getItem('plsm.language')).toBe('nl');
    // The menu closes after a choice.
    expect(screen.queryByRole('radio', { name: /Papiamentu/ })).not.toBeInTheDocument();
  });
});
