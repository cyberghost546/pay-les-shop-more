// src/pages/Dashboard/useSidebarWidth.js
//
// How wide the sidebar is, and the drag handle that changes it.
//
// The width is a CSS custom property rather than a prop threaded through the
// layout: the sidebar, the topbar's wordmark column and the content's left
// margin all have to move together, and they are in three different parts of
// the tree. One variable on the shell is what keeps them aligned.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dashboard:sidebar-width';

// The floor is set by the topbar wordmark — "PayLesShopMore.com" at its
// weight needs about this much before it starts to clip. The ceiling is where
// a navigation column stops being a column and starts eating the table.
export const SIDEBAR_MIN = 210;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 240;

const clamp = (value) =>
  Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)));

/** The stored width, or the default. */
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return SIDEBAR_DEFAULT;

    const value = Number(raw);
    // A hand-edited or half-written value must not leave the sidebar
    // unusable, so anything that is not a number falls back rather than
    // propagating NaN into the layout.
    return Number.isFinite(value) ? clamp(value) : SIDEBAR_DEFAULT;
  } catch {
    // Private browsing and "block site data" both throw on access rather
    // than returning null. A remembered width is a convenience; losing it is
    // not worth a blank dashboard.
    return SIDEBAR_DEFAULT;
  }
}

/**
 * @returns {{ width: number, resizing: boolean, handleProps: object }}
 *   `handleProps` spreads onto the drag handle and carries both the pointer
 *   handlers and the ARIA a focusable separator needs.
 */
export function useSidebarWidth() {
  // Lazy initialiser: localStorage is read once on mount, not on every render.
  const [width, setWidth] = useState(readStored);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    // Held back until the drag ends. Writing on every pointermove is a
    // synchronous disk-backed write per frame, for a value only the last of
    // which matters.
    if (resizing) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // Same as reading: not worth breaking the page over.
    }
  }, [width, resizing]);

  const startResize = useCallback((event) => {
    // Ignore the right and middle buttons, which should not drag anything.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Stops the drag from selecting the nav labels it passes over.
    event.preventDefault();
    // Capture, so the pointer keeps reporting to this handle even when it
    // runs ahead of it — a fast drag otherwise leaves the handle behind and
    // the gesture dies on whatever element is under the cursor.
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }, []);

  const onPointerMove = useCallback(
    (event) => {
      if (!resizing) return;
      // The sidebar is docked at x=0, so its width is simply how far along
      // the viewport the pointer is.
      setWidth(clamp(event.clientX));
    },
    [resizing],
  );

  const endResize = useCallback(() => setResizing(false), []);

  const onKeyDown = useCallback((event) => {
    // A separator that can only be dragged is a control a keyboard cannot
    // reach at all, so the arrows do the same job.
    const step = event.shiftKey ? 48 : 16;

    switch (event.key) {
      case 'ArrowLeft':
        setWidth((current) => clamp(current - step));
        break;
      case 'ArrowRight':
        setWidth((current) => clamp(current + step));
        break;
      case 'Home':
        setWidth(SIDEBAR_MIN);
        break;
      case 'End':
        setWidth(SIDEBAR_MAX);
        break;
      case 'Enter':
      case ' ':
        setWidth(SIDEBAR_DEFAULT);
        break;
      default:
        // Everything else keeps its normal meaning — Tab especially, which
        // has to stay able to leave the handle.
        return;
    }

    event.preventDefault();
  }, []);

  // Double-click the divider to put it back, the same gesture the same
  // divider answers to in an editor.
  const onDoubleClick = useCallback(() => setWidth(SIDEBAR_DEFAULT), []);

  return {
    width,
    resizing,
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize the sidebar',
      'aria-valuenow': width,
      'aria-valuemin': SIDEBAR_MIN,
      'aria-valuemax': SIDEBAR_MAX,
      tabIndex: 0,
      onPointerDown: startResize,
      onPointerMove,
      onPointerUp: endResize,
      // Fires if the capture is broken for any other reason — the tab losing
      // focus mid-drag, a browser gesture taking over. Without it the shell
      // would be left stuck in its resizing state.
      onLostPointerCapture: endResize,
      onKeyDown,
      onDoubleClick,
    },
  };
}
