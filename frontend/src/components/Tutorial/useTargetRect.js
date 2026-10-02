// src/components/Tutorial/useTargetRect.js
//
// Finds the element a tour step wants to highlight and reports where it is on
// the screen, so the spotlight can be drawn around it.
//
// - `target` is a CSS selector, a list of selectors (first visible match
//   wins), or null.
// - Returns null when there is nothing to highlight: no target, no match, or
//   a match that is not visible (e.g. "Sign up" inside the closed phone
//   menu, which is hidden with visibility/opacity rather than removed). The
//   step then shows without a spotlight. It never throws.
// - If the element is off screen, or so far down that the tour card would
//   not fit beside it, the page scrolls it up near the top, once per step.
//   Elements that do not move with the page (the sticky header, the "?"
//   button) are never scrolled to.
// - While the step is showing, the position is re-checked every animation
//   frame, so the spotlight stays on the element through scrolling,
//   resizing, smooth-scroll animations and late-loading images. It only
//   causes a re-render when the position actually changes.

import { useEffect, useState } from 'react';

// Leaves room for the sticky header when scrolling an element into view.
const SCROLL_OFFSET = 110;

/**
 * Whether the visitor can actually see the element: it has a size, and
 * neither it nor anything around it is display: none, visibility: hidden or
 * fully transparent.
 */
function isVisible(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  // Modern browsers can answer this in one call.
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
    });
  }

  // Older browsers: visibility is inherited, so the element's own computed
  // value is enough; opacity is not, so the ancestors are checked too.
  if (window.getComputedStyle(element).visibility === 'hidden') return false;
  for (let node = element; node; node = node.parentElement) {
    if (window.getComputedStyle(node).opacity === '0') return false;
  }
  return true;
}

function findVisible(target) {
  if (!target) return null;
  const selectors = Array.isArray(target) ? target : [target];

  for (const selector of selectors) {
    let elements;
    try {
      elements = document.querySelectorAll(selector);
    } catch {
      // An invalid selector in tutorialSteps.js: skip it rather than crash.
      continue;
    }
    for (const element of elements) {
      if (isVisible(element)) return element;
    }
  }
  return null;
}

/** Whether the element stays put when the page scrolls (fixed or sticky). */
function isPinned(element) {
  for (let node = element; node; node = node.parentElement) {
    const { position } = window.getComputedStyle(node);
    if (position === 'fixed' || position === 'sticky') return true;
  }
  return false;
}

// Below this point on the screen (as a share of its height) an element is
// scrolled up, to leave room for the card under it.
const SCROLL_BELOW = 0.3;

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * @param {string|string[]|null} target  selector(s) from tutorialSteps.js
 * @param {string} stepId  changes when the step changes, to re-search
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
export function useTargetRect(target, stepId) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    // undefined, not null, so the first measurement is always reported -
    // including "nothing to highlight", which clears the previous step's
    // spotlight.
    let current;

    const schedule = window.requestAnimationFrame
      ? (fn) => window.requestAnimationFrame(fn)
      : (fn) => window.setTimeout(fn, 16);
    const cancel = window.cancelAnimationFrame
      ? (id) => window.cancelAnimationFrame(id)
      : (id) => window.clearTimeout(id);

    function measure() {
      const element = findVisible(target);
      let next = null;

      if (element) {
        const box = element.getBoundingClientRect();
        next = {
          top: Math.round(box.top),
          left: Math.round(box.left),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };

        // Off screen, or low down? Scroll it up, once per step (otherwise
        // the visitor could never scroll away from it).
        const needsScroll =
          box.top < 0 ||
          box.bottom > window.innerHeight ||
          box.top > window.innerHeight * SCROLL_BELOW;
        if (needsScroll && !scrolled) {
          scrolled = true;
          // A fixed or sticky element does not move when the page scrolls,
          // so scrolling would only jolt the page behind it.
          if (!isPinned(element)) {
            try {
              window.scrollTo({
                top: window.scrollY + box.top - SCROLL_OFFSET,
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              });
            } catch {
              // Very old browsers or test environments: no scrolling, the
              // step still shows.
            }
          }
        }
      }

      if (!sameRect(next, current)) {
        current = next;
        setRect(next);
      }
      frame = schedule(measure);
    }

    measure();
    return () => cancel(frame);
  }, [target, stepId]);

  return rect;
}
