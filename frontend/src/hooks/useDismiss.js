// src/hooks/useDismiss.js
import { useEffect } from 'react';

/**
 * Closes a popup menu when the visitor clicks or taps outside it, or presses
 * Escape. `ref` is the element holding both the button and the menu, so a
 * click on the button itself is left to the button.
 *
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {boolean} open
 * @param {() => void} close
 */
export function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;

    function onPointer(event) {
      if (ref.current && !ref.current.contains(event.target)) close();
    }
    function onKey(event) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}
