// The privacy page is prose, so there is little behaviour to test. What is
// worth pinning down is the seam between the component and the translations:
// the page names its sections in code and looks their words up by key, and a
// key that exists in Dutch but not in Papiamentu shows Dutch to a Papiamentu
// reader without any error being raised.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { translations } from '../../i18n/translations';
import Privacy from './Privacy';

/** The shape of a value, ignoring the words themselves. */
function shape(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape(value[key])]),
    );
  }
  return typeof value;
}

describe('the privacy page', () => {
  it('opens with the title and a way back to the home page', () => {
    renderWithProviders(<Privacy />, { route: '/privacy' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('carries every section of the statement', () => {
    renderWithProviders(<Privacy />, { route: '/privacy' });

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      'How we use the data we collect',
      'Purposes',
      'Third parties',
      'Changes',
      'Turning cookies off',
    ]);

    // The three that belong under the first heading rather than after it.
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Using our services', 'Communication', 'Cookies']);
  });

  it('renders words rather than translation keys', () => {
    const { container } = renderWithProviders(<Privacy />, {
      route: '/privacy',
    });

    // What a missing key looks like: t() returns the path it was given, so
    // "privacy.sections.changes.heading" appears in the page as text.
    expect(container.textContent).not.toMatch(/privacy\.[a-z]/i);
  });

  it('sends a reader with a question to the contact page', () => {
    renderWithProviders(<Privacy />, { route: '/privacy' });

    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  it('says the same thing in all three languages', () => {
    // Not the same words — the same keys, and the same number of paragraphs
    // per section. A translation that drops a paragraph drops a sentence of a
    // legal statement, which is the one place that is not a cosmetic bug.
    const dutch = shape(translations.nl.privacy);

    expect(shape(translations.en.privacy)).toEqual(dutch);
    expect(shape(translations.pap.privacy)).toEqual(dutch);
  });
});
