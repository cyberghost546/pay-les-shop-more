import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpinningWheel from './SpinningWheel';
import { segments } from './segments';

/** The selected name, as the live region under the wheel announces it. */
function selectedName() {
  return screen.getByText(/Selected segment/).textContent.replace('Selected segment: ', '');
}

function rotationOf(container) {
  return Number(container.querySelector('svg').style.transform.match(/-?[\d.]+/)[0]);
}

describe('SpinningWheel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the first name, then the next one every 10 seconds', () => {
    render(<SpinningWheel />);
    expect(selectedName()).toBe('Ikea');

    act(() => vi.advanceTimersByTime(9_999));
    expect(selectedName()).toBe('Ikea');

    act(() => vi.advanceTimersByTime(1));
    expect(selectedName()).toBe('Bol.com');
  });

  it('goes from the last name back to the first, still turning the same way', () => {
    const { container } = render(<SpinningWheel />);
    let previous = rotationOf(container);

    for (let step = 1; step <= segments.length; step += 1) {
      act(() => vi.advanceTimersByTime(10_000));
      const now = rotationOf(container);
      expect(now).toBeLessThan(previous);
      previous = now;
    }

    expect(selectedName()).toBe('Ikea');
  });

  it('announces changes politely', () => {
    render(<SpinningWheel />);
    expect(screen.getByText(/Selected segment/).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('stops its timer when unmounted', () => {
    const { unmount } = render(<SpinningWheel />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
