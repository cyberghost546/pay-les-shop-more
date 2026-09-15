// src/components/SpinningWheel/SpinningWheel.jsx
//
// A wheel of segments that turns to the next one on a timer, with the
// selected name written underneath. The current index is the single source of
// truth: it decides the rotation, the pointer's segment, the name shown and
// what screen readers are told.
//
// The names live in segments.js.

import { useEffect, useId, useRef, useState } from 'react';
import { normaliseSegments, segments as defaultSegments } from './segments';
import styles from './SpinningWheel.module.css';

// One full extra turn per move, so each change reads as a spin rather than a
// small nudge. Set to 0 for a plain step to the next segment.
const EXTRA_TURNS = 1;

// Changes are announced to screen readers only when the wheel turns this
// slowly or slower.
const ANNOUNCE_MIN_MS = 10_000;

const COLOURS = ['#0b2545', '#0ea5e9', '#123a63', '#38bdf8', '#1d4ed8', '#7dd3fc', '#071a30', '#60a5fa'];
// Dark text on the light segments, white on the dark ones.
const LIGHT = new Set(['#38bdf8', '#7dd3fc', '#60a5fa', '#0ea5e9']);

const RADIUS = 96;
// Where a logo badge sits along its slice, and how big it is. At 8 slices the
// slice is about 47 units wide at this distance, so a 22-unit radius fits.
const BADGE_DISTANCE = 60;
const BADGE_RADIUS = 22;

/** The SVG path for one pie slice, `index` of `count`, with segment 0 centred at the top. */
function slicePath(index, count) {
  const step = 360 / count;
  const toRadians = (degrees) => ((degrees - 90) * Math.PI) / 180;
  const start = toRadians(index * step - step / 2);
  const end = toRadians(index * step + step / 2);
  const x1 = RADIUS * Math.cos(start);
  const y1 = RADIUS * Math.sin(start);
  const x2 = RADIUS * Math.cos(end);
  const y2 = RADIUS * Math.sin(end);
  const largeArc = step > 180 ? 1 : 0;
  return `M 0 0 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/**
 * @param {{ segments?: (string|{name: string})[], intervalMs?: number, label?: string }} props
 */
export default function SpinningWheel({ segments = defaultSegments, intervalMs = 10_000, label = 'Shop wheel' }) {
  const items = normaliseSegments(segments);
  const count = items.length;
  const step = 360 / count;
  // Unique per wheel, so two wheels on a page never share a clip path.
  const clipId = `wheel-badge-${useId().replace(/:/g, '')}`;

  // The selected segment.
  const [currentIndex, setCurrentIndex] = useState(0);
  // The wheel's total rotation in degrees. It only ever grows, so moving from
  // the last segment back to the first keeps turning the same way instead of
  // spinning backwards.
  const [rotation, setRotation] = useState(0);

  // Only spin while somebody can see it: not when scrolled off screen, and not
  // in a background tab. Saves battery, and nobody comes back to a wheel that
  // spun a hundred times while they were away.
  const regionRef = useRef(null);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const element = regionRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const running = count >= 2 && onScreen && pageVisible;

  useEffect(() => {
    if (!running) return undefined;

    const timer = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % count);
      // Anticlockwise brings the next segment (clockwise of the pointer) up
      // under it.
      setRotation((degrees) => degrees - (EXTRA_TURNS * 360 + step));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [running, count, step, intervalMs]);

  if (count === 0) return null;

  const current = items[currentIndex];

  // Reading out a new name every few seconds would talk over whatever else a
  // screen reader user is listening to. So the change is only announced when
  // the wheel is slow; a fast wheel gives the whole list once instead.
  const announce = intervalMs >= ANNOUNCE_MIN_MS;

  return (
    <div ref={regionRef} className={styles.wheelRegion} role="region" aria-label={label}>
      {!announce && (
        <p className={styles.srOnly}>{items.map((segment) => segment.name).join(', ')}</p>
      )}

      <div className={styles.wheelFrame}>
        <span className={styles.pointer} aria-hidden="true" />

        {/* Purely visual: the name below is what assistive tech reads. */}
        <svg
          className={styles.wheel}
          viewBox="-100 -100 200 200"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            {/* One round badge shape, centred on the origin, reused by every logo. */}
            <clipPath id={clipId}>
              <circle r={BADGE_RADIUS} />
            </clipPath>
          </defs>

          <circle r="99" className={styles.rim} />
          {items.map((segment, index) => {
            const fill = COLOURS[index % COLOURS.length];
            return (
              <g key={`${segment.name}-${index}`}>
                <path d={slicePath(index, count)} fill={fill} className={styles.slice} />

                {segment.image ? (
                  // Out along the middle of the slice. Not turned any further,
                  // so the logo is upright when its slice reaches the pointer.
                  <g transform={`rotate(${index * step}) translate(0 -${BADGE_DISTANCE})`}>
                    <circle r={BADGE_RADIUS + 1.5} className={styles.badge} />
                    <image
                      href={segment.image}
                      x={-BADGE_RADIUS}
                      y={-BADGE_RADIUS}
                      width={BADGE_RADIUS * 2}
                      height={BADGE_RADIUS * 2}
                      clipPath={`url(#${clipId})`}
                      // cover crops a logo on colour to the badge; anything
                      // else is fitted whole, with a margin inside the circle.
                      preserveAspectRatio={segment.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
                      transform={segment.fit === 'cover' ? undefined : 'scale(0.8)'}
                    />
                  </g>
                ) : (
                  <text
                    className={styles.sliceLabel}
                    fill={LIGHT.has(fill) ? '#071a30' : '#ffffff'}
                    // Out along the middle of the slice, reading from the hub
                    // towards the rim.
                    transform={`rotate(${index * step}) translate(0 -58) rotate(90)`}
                  >
                    {segment.name}
                  </text>
                )}
              </g>
            );
          })}
          <circle r="16" className={styles.hub} />
        </svg>
      </div>

      {/* The selected shop under the wheel: its logo, or its name when it has
          none. Also the live region, so screen readers hear "Selected
          segment: Bol.com" when it changes. */}
      <div className={styles.selected} aria-live={announce ? 'polite' : 'off'} aria-atomic="true">
        {announce && <span className={styles.srOnly}>Selected segment: {current.name}</span>}
        {current.image ? (
          // Keyed by index, so each change mounts a fresh logo and fades it in.
          <span key={currentIndex} className={styles.selectedCard} aria-hidden="true">
            <img src={current.image} alt="" className={styles.selectedLogo} />
          </span>
        ) : (
          <span key={currentIndex} className={styles.selectedName} aria-hidden="true">
            {current.name}
          </span>
        )}
      </div>
    </div>
  );
}
