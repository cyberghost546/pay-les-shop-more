// The page tours: a short tour of each page, started from the robot's
// "Tour this page". The general tour has its own tests (Tutorial.test.jsx).
//
// jsdom reports an English browser, so these read the English dictionary.

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { translations } from '../../i18n/translations';
import PageGuide from '../PageGuide/PageGuide';
import TutorialProvider from './TutorialProvider';
import { COMPLETED_KEY } from './storage';
import { GENERAL_TOUR, pageTours, tourForPath, tutorialSteps } from './tutorialSteps';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isChecking: false }),
}));

const ROBOT = 'Open help and the guide for this page';

function renderPage(route, page = null) {
  return renderWithProviders(
    <TutorialProvider>
      {page}
      <PageGuide />
    </TutorialProvider>,
    { route },
  );
}

async function startPageTour(user) {
  await user.click(screen.getByRole('button', { name: ROBOT }));
  await user.click(screen.getByRole('button', { name: /Tour this page/ }));
  return screen.findByRole('dialog');
}

const get = (dictionary, path) =>
  path.split('.').reduce((value, key) => value?.[key], dictionary);

// Load the tour's on-demand card once up front; see the same note in
// Tutorial.test.jsx.
beforeAll(async () => {
  await import('./TutorialModal');
});

beforeEach(() => {
  // The general tour would otherwise open by itself on some of these pages.
  window.localStorage.setItem(COMPLETED_KEY, 'true');
  window.localStorage.setItem('plsm.tutorialVersion', '1');
});

describe('which tour belongs to which page', () => {
  it('matches pages to their tours, and the rest to the general tour', () => {
    expect(tourForPath('/services')).toBe('services');
    expect(tourForPath('/destinations')).toBe('destinations');
    expect(tourForPath('/destinations/aruba')).toBe('destination');
    expect(tourForPath('/profile')).toBe('profile');
    expect(tourForPath('/')).toBe(GENERAL_TOUR);
    expect(tourForPath('/no-such-page')).toBe(GENERAL_TOUR);
  });

  it('has a title and text for every step, in every language', () => {
    for (const language of ['nl', 'en', 'pap']) {
      const dictionary = translations[language];
      for (const [tour, steps] of Object.entries(pageTours)) {
        for (const step of steps) {
          const base = `onboarding.pages.${tour}.${step.id}`;
          expect(get(dictionary, `${base}.title`), `${language} ${base}.title`).toBeTruthy();
          expect(get(dictionary, `${base}.text`), `${language} ${base}.text`).toBeTruthy();
        }
      }
      for (const step of tutorialSteps) {
        const base = `onboarding.steps.${step.id}`;
        expect(get(dictionary, `${base}.title`), `${language} ${base}.title`).toBeTruthy();
      }
    }
  });
});

describe('a page tour', () => {
  it('explains the page it is started on', async () => {
    const user = userEvent.setup();
    renderPage('/login');

    const tour = await startPageTour(user);
    const steps = pageTours.login.length;
    expect(within(tour).getByText(`Step 1 of ${steps}`)).toBeInTheDocument();
    expect(within(tour).getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    // Nothing to go back to on the first step of a page tour.
    expect(within(tour).queryByRole('button', { name: 'Back' })).toBeNull();

    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(
      within(tour).getByRole('heading', { name: 'Forgotten your password?' }),
    ).toBeInTheDocument();
  });

  it('ends with Finish only, and does not count as the general tour', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem(COMPLETED_KEY);
    renderPage('/signup');

    const tour = await startPageTour(user);
    for (let i = 1; i < pageTours.signup.length; i += 1) {
      await user.click(within(tour).getByRole('button', { name: 'Next' }));
    }

    expect(within(tour).queryByRole('button', { name: 'Open website' })).toBeNull();
    await user.click(within(tour).getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Closing a page tour leaves the general tour's "seen" flag alone.
    expect(window.localStorage.getItem(COMPLETED_KEY)).toBeNull();
  });

  it('is not followed by the general tour popping up', async () => {
    // A brand-new visitor (general tour not seen) on a page where the
    // general tour would open by itself, who opens a page tour first.
    const user = userEvent.setup();
    window.localStorage.removeItem(COMPLETED_KEY);
    renderPage('/services');

    const tour = await startPageTour(user);
    await user.click(within(tour).getByRole('button', { name: 'Close tutorial' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 1600);
        }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lights up the part of the page it is talking about', async () => {
    const user = userEvent.setup();
    renderPage('/contact', <section data-tour="contact-methods">Email · Phone · Address</section>);
    vi.spyOn(
      document.querySelector('[data-tour="contact-methods"]'),
      'getBoundingClientRect',
    ).mockReturnValue({ top: 120, left: 40, width: 600, height: 100, bottom: 220, right: 640 });

    await startPageTour(user);

    expect(await screen.findByTestId('tutorial-spotlight')).toHaveStyle({
      top: '112px',
      left: '32px',
    });
  });

  it('starts the general tour on the home page', async () => {
    const user = userEvent.setup();
    renderPage('/');

    const tour = await startPageTour(user);
    expect(
      within(tour).getByRole('heading', { name: 'Welcome to Pay Less Shop More' }),
    ).toBeInTheDocument();
  });
});
