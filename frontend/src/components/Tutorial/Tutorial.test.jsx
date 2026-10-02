// The onboarding tour and its "?" help button.
//
// The behaviour worth pinning down: when the tour opens by itself (once, for
// a new signed-out visitor), that every way of moving and closing works,
// that it is remembered in localStorage, that it survives targets which are
// not on the page, and that the robot's Help list can always bring it back.
//
// jsdom reports an English browser, so these read the English dictionary.
// jsdom also draws nothing: every element measures 0×0, so to test the
// spotlight an element's size is faked with getBoundingClientRect.

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import TutorialProvider from './TutorialProvider';
import PageGuide from '../PageGuide/PageGuide';
import { COMPLETED_KEY, VERSION_KEY } from './storage';
import { TUTORIAL_VERSION, tutorialSteps } from './tutorialSteps';

const auth = { user: null, isAuthenticated: false, isChecking: false };

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => auth,
}));

const TOTAL = tutorialSteps.length;

/** What App.jsx renders, minus the rest of the site. */
function renderSite({ route = '/', page = null } = {}) {
  return renderWithProviders(
    <TutorialProvider>
      {page}
      <PageGuide />
    </TutorialProvider>,
    { route },
  );
}

function markDone(version = TUTORIAL_VERSION) {
  window.localStorage.setItem(COMPLETED_KEY, 'true');
  window.localStorage.setItem(VERSION_KEY, String(version));
}

/** Long enough for the auto-open delay to have passed. */
const waitPastDelay = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 1600);
      }),
  );

// The tour opens 1.2s after the page; the rest is room for a busy machine
// running the whole suite in parallel (see the note in src/test/setup.js).
const findTour = () => screen.findByRole('dialog', {}, { timeout: 5000 });

const ROBOT = 'Open help and the guide for this page';

/** Opens the tour from the Help list in the robot's panel. */
async function openFromHelp(user, option = 'Tour this page') {
  await user.click(screen.getByRole('button', { name: ROBOT }));
  await user.click(screen.getByRole('button', { name: new RegExp(option) }));
  return findTour();
}

// The tour's card is loaded on demand (lazy), and the first load compiles it.
// With the whole suite running in parallel that can take longer than the
// wait in the first test, which then fails for want of CPU rather than for
// anything wrong. Loading it once up front makes every test start equal.
beforeAll(async () => {
  await import('./TutorialModal');
});

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  auth.isChecking = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening by itself', () => {
  it('opens for a new visitor who is signed out', async () => {
    renderSite();

    const tour = await findTour();
    expect(
      within(tour).getByRole('heading', { name: 'Welcome to Pay Less Shop More' }),
    ).toBeInTheDocument();
    expect(within(tour).getByText(`Step 1 of ${TOTAL}`)).toBeInTheDocument();
    expect(within(tour).getByText(/About 2 minutes/)).toBeInTheDocument();
    expect(within(tour).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('does not open for a signed-in customer', async () => {
    auth.user = { id: 1 };
    auth.isAuthenticated = true;
    renderSite();

    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('waits while the log-in check is still running', async () => {
    auth.isChecking = true;
    renderSite();

    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open on the tutorial or sign-up pages', async () => {
    const { unmount } = renderSite({ route: '/tutorial' });
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    renderSite({ route: '/signup' });
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open again once completed (e.g. after a refresh)', async () => {
    markDone();
    renderSite();

    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens again when a new version of the tour is released', async () => {
    markDone(TUTORIAL_VERSION - 1);
    renderSite();

    expect(await findTour()).toBeInTheDocument();
  });
});

describe('moving through the steps', () => {
  it('goes forward and back, with the progress following', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();

    await user.click(within(tour).getByRole('button', { name: 'Start tutorial' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText(`Step 2 of ${TOTAL}`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(`Step 3 of ${TOTAL}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(`Step 2 of ${TOTAL}`)).toBeInTheDocument();
  });

  it('works with the arrow keys and closes on Escape', async () => {
    const user = userEvent.setup();
    renderSite();
    await findTour();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText(`Step 2 of ${TOTAL}`)).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText(`Step 1 of ${TOTAL}`)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.localStorage.getItem(COMPLETED_KEY)).toBe('true');
  });

  it('keeps Tab inside the card', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();

    // Tab through more times than there are buttons: focus never leaves.
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(tour.contains(document.activeElement)).toBe(true);
    }
  });

  it('reaches the end without crashing when no target is on the page', async () => {
    // Nothing on this "page" matches any target: every step must still show.
    const user = userEvent.setup();
    renderSite();
    await findTour();

    await user.click(screen.getByRole('button', { name: 'Start tutorial' }));
    for (let step = 2; step < TOTAL; step += 1) {
      expect(screen.getByText(`Step ${step} of ${TOTAL}`)).toBeInTheDocument();
      expect(screen.queryByTestId('tutorial-spotlight')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }

    expect(screen.getByRole('heading', { name: 'Need help?' })).toBeInTheDocument();
    expect(screen.getByText("You're all set!", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(COMPLETED_KEY)).toBe('true');
    expect(window.localStorage.getItem(VERSION_KEY)).toBe(String(TUTORIAL_VERSION));
  });
});

describe('when the browser cannot save that it was seen', () => {
  it('still stays closed after closing (private window, blocked data)', async () => {
    const user = userEvent.setup();
    // Every write to localStorage fails, as in a private window.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderSite();
    await findTour();

    await user.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Long past the auto-open delay: it must not come back by itself.
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('closing', () => {
  it('Skip closes it for good', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSite();
    await findTour();

    await user.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // A later visit, or a refresh.
    unmount();
    renderSite();
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the × closes it from any step', async () => {
    const user = userEvent.setup();
    renderSite();
    await findTour();
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }));

    await user.click(screen.getByRole('button', { name: 'Close tutorial' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the spotlight', () => {
  it('lights up the target element when it is on the page', async () => {
    const user = userEvent.setup();
    const page = (
      <a href="/signup" data-tour="signup">
        Sign up
      </a>
    );
    renderSite({ page });

    const target = document.querySelector('[data-tour="signup"]');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      left: 900,
      width: 100,
      height: 40,
      bottom: 60,
      right: 1000,
    });

    await findTour();
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }));

    const spotlight = await screen.findByTestId('tutorial-spotlight');
    // The element's box plus 8px padding all round.
    expect(spotlight).toHaveStyle({
      top: '12px',
      left: '892px',
      width: '116px',
      height: '56px',
    });

    // The next step's target is not on this page: the spotlight must go,
    // not stay behind on the previous step's element.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.queryByTestId('tutorial-spotlight')).toBeNull());
  });

  it('ignores a target that is there but hidden (the closed phone menu)', async () => {
    const user = userEvent.setup();
    const page = (
      <div style={{ visibility: 'hidden' }}>
        <a href="/signup" data-tour="signup">
          Sign up
        </a>
      </div>
    );
    renderSite({ page });

    const target = document.querySelector('[data-tour="signup"]');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      left: 900,
      width: 100,
      height: 40,
      bottom: 60,
      right: 1000,
    });

    await findTour();
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByTestId('tutorial-spotlight')).toBeNull();
  });
});

describe('the address step', () => {
  it('shows the warehouse address and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText });

    markDone();
    renderSite();
    await openFromHelp(user);
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: /Start tutorial|Next/ }));
    }

    expect(
      screen.getByRole('heading', { name: 'Send your order to our warehouse' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pay less Shop More')).toBeInTheDocument();
    expect(screen.getByText('Hertzstraat 10')).toBeInTheDocument();
    expect(screen.getByText('2652 XX')).toBeInTheDocument();
    expect(screen.getByText('Berkel en Rodenrijs')).toBeInTheDocument();
    // Billing AND delivery: a wrong billing address means the shipment
    // cannot be processed.
    expect(
      screen.getByText(/both the billing details and the delivery address/),
    ).toBeInTheDocument();
    expect(screen.getByText(/we cannot process your shipment/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy address/ }));
    expect(writeText).toHaveBeenCalledWith(
      'Pay less Shop More\nHertzstraat 10\n2652 XX Berkel en Rodenrijs\nNetherlands',
    );
    expect(await screen.findByText('Address copied!')).toBeInTheDocument();
  });
});

describe('the register step', () => {
  it('comes after the address, with the booking form and e-mail address', async () => {
    const user = userEvent.setup();
    markDone();
    renderSite();
    await openFromHelp(user);
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: /Start tutorial|Next/ }));
    }

    expect(
      screen.getByRole('heading', { name: 'Register your shipment with us' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Step 5 of ${TOTAL}`)).toBeInTheDocument();
    // {email} filled in from src/data/company.js.
    expect(screen.getByText(/email us at info@paylesshopmore\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Send us the invoice/)).toBeInTheDocument();
  });

  it('highlights the Booking link in the header', async () => {
    const user = userEvent.setup();
    const page = (
      <a href="/booking" data-tour="booking">
        Booking
      </a>
    );
    markDone();
    renderSite({ page });
    vi.spyOn(
      document.querySelector('[data-tour="booking"]'),
      'getBoundingClientRect',
    ).mockReturnValue({ top: 20, left: 700, width: 80, height: 40, bottom: 60, right: 780 });

    await openFromHelp(user);
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: /Start tutorial|Next/ }));
    }

    expect(await screen.findByTestId('tutorial-spotlight')).toHaveStyle({
      top: '12px',
      left: '692px',
    });
  });
});

describe('the shipping step', () => {
  it('shows the sailing days and flights from the destination data', async () => {
    const user = userEvent.setup();
    markDone();
    renderSite();
    await openFromHelp(user, 'Shipping information');

    expect(
      screen.getByRole('heading', { name: 'Choose your shipping method' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Step 7 of ${TOTAL}`)).toBeInTheDocument();
    expect(screen.getByText('16 days at sea')).toBeInTheDocument();
    expect(screen.getByText('17 days at sea')).toBeInTheDocument();
    expect(screen.getByText('18 days at sea')).toBeInTheDocument();
    expect(screen.getByText('All islands')).toBeInTheDocument();
    expect(screen.getByText(/Thursday 12:00/)).toBeInTheDocument();
    expect(screen.getByText(/Monday 12:00/)).toBeInTheDocument();
    expect(screen.getByText(/These are estimates/)).toBeInTheDocument();
  });

  it('sends people to the quote form instead of giving a price', async () => {
    const user = userEvent.setup();
    markDone();
    renderSite();
    await openFromHelp(user, 'Shipping information');

    expect(screen.getByText('Want to know the price?')).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Choose your island and request a quote',
    });
    expect(link).toHaveAttribute('href', '/destinations');

    // Following it closes the tour.
    await user.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("help in the robot's panel", () => {
  it('is there even after the tour was completed, and restarts it', async () => {
    const user = userEvent.setup();
    markDone();
    renderSite();
    await waitPastDelay();
    expect(screen.queryByRole('dialog')).toBeNull();

    const tour = await openFromHelp(user);
    expect(within(tour).getByText(`Step 1 of ${TOTAL}`)).toBeInTheDocument();
  });

  it('lists the help options', async () => {
    const user = userEvent.setup();
    markDone();
    renderSite();

    await user.click(screen.getByRole('button', { name: ROBOT }));
    for (const name of [
      'Tour this page',
      'Shipping information',
      'How to order',
      'How to track my package',
      'Contact us',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
});
