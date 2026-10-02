// src/components/Tutorial/TutorialSpotlight.jsx
//
// The dark layer over the page, with a lit "hole" and a glowing yellow ring
// round the element being explained.
//
// How the hole works: one box is drawn exactly over the element, and a huge
// shadow around that box darkens everything else. Moving the box (with a CSS
// transition) makes the spotlight glide from one element to the next.
//
// A transparent layer on top catches clicks, so the page cannot be used by
// accident while the tour is open. (The tour can always be closed with the
// card's buttons or Escape.)

import styles from './Tutorial.module.css';

// Space between the element's edge and the glowing ring, in pixels.
const PADDING = 8;

/**
 * @param {object} props
 * @param {{top:number,left:number,width:number,height:number}|null} props.rect
 *        where the element is, or null to darken the whole page
 * @param {() => void} props.onBackdropClick
 */
export default function TutorialSpotlight({ rect, onBackdropClick }) {
  return (
    <>
      {rect ? (
        <div
          className={styles.spotlight}
          data-testid="tutorial-spotlight"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.dim} aria-hidden="true" />
      )}

      <div
        className={styles.clickShield}
        onClick={onBackdropClick}
        aria-hidden="true"
      />
    </>
  );
}
