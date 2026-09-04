// src/hooks/useInViewport.js
import { useEffect, useRef, useState } from 'react';

/** True when the visitor has asked their system for less movement. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Tells you once when an element has been scrolled into view.
 *
 * Used for the reveal animations and the counting statistics. It latches: the
 * flag never goes back to false, so a section does not replay its animation
 * every time it passes the fold, which is distracting rather than lively.
 *
 * @param {{ rootMargin?: string, threshold?: number }} [options]
 * @returns {[import('react').RefObject<HTMLElement>, boolean]}
 */
export function useInViewport({ rootMargin = '0px 0px -80px 0px', threshold = 0.15 } = {}) {
  const ref = useRef(null);

  // Decided before the first paint rather than in an effect. Someone who has
  // asked for less movement, or whose browser has no IntersectionObserver,
  // starts out "already seen" — so the content is simply there, and no
  // section is ever left invisible waiting for an observer that never fires.
  const [seen, setSeen] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          // One-shot: nothing left to watch for.
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, threshold, seen]);

  return [ref, seen];
}
