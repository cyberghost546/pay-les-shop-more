// The guided walkthrough. What is worth pinning down here is less the layout
// than the two things a visitor is relying on:
//
//   - the warehouse address, which they copy into a shop's checkout form. It
//     is written once in the page and must read exactly as the office gives
//     it out, so both the player and the written list are checked against it;
//   - the written version, which is what a browser with no speech voice, a
//     printer, or a screen reader falls back to. It carries every step, not a
//     summary of them.
//
// jsdom reports an English browser, so the dictionary these tests read is
// the English one.
//
// jsdom has no speechSynthesis, which is also the case in a browser that
// cannot narrate — so these tests exercise that path by default, and the one
// about the listen button stubs the API in.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Tutorial from './Tutorial';

const STEP_COUNT = 8;

afterEach(() => {
  delete window.speechSynthesis;
  vi.restoreAllMocks();
});

/** A speechSynthesis stand-in that records what it was asked to say. */
function stubSpeech() {
  const spoken = [];
  const voice = { lang: 'nl-NL', name: 'Test voice' };

  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };

  window.speechSynthesis = {
    getVoices: () => [voice],
    speak: (utterance) => spoken.push(utterance.text),
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return spoken;
}

describe('the tutorial page', () => {
  it('opens on the first step with the banner above it', () => {
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'How it works' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Step 1 / ${STEP_COUNT}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('steps forward to the billing details and shows the warehouse address', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    // Account, quote, order, then the billing step.
    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }

    expect(screen.getByText(`Step 4 / ${STEP_COUNT}`)).toBeInTheDocument();

    // Twice over: once in the player, once in the written list below it.
    expect(screen.getAllByText('Pay less Shop More')).toHaveLength(2);
    expect(screen.getAllByText(/Hertzstraat 10/)).toHaveLength(2);
    expect(screen.getAllByText(/2652 XX Berkel en Rodenrijs/)).toHaveLength(2);
  });

  it('writes every step out below the player, in order', () => {
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    // The written section is the only place all eight titles appear at once.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Create an account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Delivery on the island' }),
    ).toBeInTheDocument();
  });

  it('offers no listen button when the browser cannot speak, and says so', () => {
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    expect(screen.queryByRole('button', { name: /Read aloud/ })).toBeNull();
    expect(
      screen.getByText(/Your browser cannot read this guide aloud/),
    ).toBeInTheDocument();
  });

  it('reads the step aloud once the visitor asks for it', async () => {
    const spoken = stubSpeech();
    const user = userEvent.setup();
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    await user.click(screen.getByRole('button', { name: /Read aloud/ }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('Create an account');

    // Moving on interrupts and reads the new step rather than queueing.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(spoken[spoken.length - 1]).toContain('Ask for a quote');
  });

  it('spells the address out in the narration of the billing step', async () => {
    const spoken = stubSpeech();
    const user = userEvent.setup();
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    await user.click(screen.getByRole('button', { name: /Read aloud/ }));
    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }

    const last = spoken[spoken.length - 1];
    expect(last).toContain('Pay less Shop More');
    expect(last).toContain('Hertzstraat 10, 2652 XX Berkel en Rodenrijs');
  });

  it('jumps to a step from the dots', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Tutorial />, { route: '/tutorial' });

    await user.click(
      screen.getByRole('button', { name: /Step 7: Follow your shipment/ }),
    );

    const player = screen.getByLabelText('Step-by-step guide');
    expect(within(player).getByText(`Step 7 / ${STEP_COUNT}`)).toBeInTheDocument();
    expect(
      within(player).getByRole('link', { name: 'Track your shipment' }),
    ).toHaveAttribute('href', '/tracking');
  });
});
