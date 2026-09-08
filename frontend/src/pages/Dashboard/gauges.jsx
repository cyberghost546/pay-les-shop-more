// src/pages/Dashboard/gauges.jsx
//
// The two small shapes the overview's summary column is built from: a ring
// showing one proportion, and a sparkline showing one series.
//
// Inline SVG, for the same reason ActivityChart is: a ring is one arc and a
// sparkline is one polyline, and neither is worth a charting dependency. They
// live here rather than in ui.jsx because that file is the dashboard's form
// controls — a select, a search box, a pagination bar — and these are
// pictures.

import { useId } from 'react';
import styles from './Dashboard.module.css';

/**
 * A proportion, drawn as a ring with the figure inside it.
 *
 * `value` and `total` rather than a ready-made percentage: a ring of nothing
 * out of nothing is not 0% or 100%, it is a question with no answer, and only
 * the raw pair can tell the difference. That case draws the empty track and
 * says so.
 *
 * @param {{ value: number, total: number, label: string, colour?: string }} props
 */
export function Donut({ value, total, label, colour = '#2563eb' }) {
  const titleId = useId();
  const known = total > 0;
  const share = known ? value / total : 0;

  // A 36-box with a radius of 15.5 gives a circumference just under 100, so
  // the dash length below is very nearly the percentage itself.
  const RADIUS = 15.5;
  const circumference = 2 * Math.PI * RADIUS;

  return (
    <div className={styles.donut}>
      <svg
        className={styles.donutRing}
        viewBox="0 0 36 36"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {known
            ? `${label}: ${value} of ${total}, ${Math.round(share * 100)} percent`
            : `${label}: nothing to measure yet`}
        </title>

        {/* The track. Always drawn, so an empty ring still reads as a ring
            waiting for a figure rather than as a missing element. */}
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3.4"
        />

        {known && share > 0 && (
          <circle
            cx="18"
            cy="18"
            r={RADIUS}
            fill="none"
            stroke={colour}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray={`${share * circumference} ${circumference}`}
            // Starts the arc at twelve o'clock. Without this it begins at
            // three, which reads as a ring drawn wrong rather than as a
            // measurement.
            transform="rotate(-90 18 18)"
          />
        )}
      </svg>

      <div className={styles.donutText}>
        <p className={styles.donutValue}>
          {known ? `${Math.round(share * 100)}%` : '—'}
        </p>
        <p className={styles.donutLabel}>{label}</p>
        <p className={styles.donutNote}>
          {known ? `${value} of ${total}` : 'Nothing yet'}
        </p>
      </div>
    </div>
  );
}

/**
 * One series as a line with the area under it filled, at the size of a word.
 *
 * No axes and no labels: it answers "which way has this been going", and the
 * number it sits beside answers "how much". A flat line is drawn down the
 * middle rather than along the floor, so a quiet week does not read as zero.
 *
 * @param {{ values: number[], colour?: string, label: string }} props
 */
export function Sparkline({ values, colour = '#ffffff', label }) {
  const titleId = useId();
  const gradientId = useId();

  if (!values || values.length < 2) return null;

  const WIDTH = 200;
  const HEIGHT = 48;

  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const span = highest - lowest;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * WIDTH;
    // A flat series has no span to scale against, so it sits halfway up.
    const y = span === 0 ? HEIGHT / 2 : HEIGHT - ((value - lowest) / span) * HEIGHT;
    // Kept off the very edge, or the round cap on the end point is clipped
    // in half by the viewBox.
    return [x, Math.min(HEIGHT - 2, Math.max(2, y))];
  });

  // Curved rather than joined corner to corner. Daily counts of nought, one
  // and two plotted as straight segments come out as a picket fence, which
  // reads as noise; the eye wants the trend, and a curve is what carries it.
  //
  // Each segment is a quadratic through the midpoint between two readings,
  // with the reading itself as the control point. That smooths the corners
  // without inventing peaks between them — a spline fitted through the points
  // would overshoot, drawing a Wednesday higher than any day actually was.
  const line = points.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;

    const [previousX, previousY] = points[index - 1];
    const midX = (previousX + x) / 2;
    const midY = (previousY + y) / 2;

    return `${path} Q ${previousX.toFixed(1)} ${previousY.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }, '');

  const [lastX, lastY] = points.at(-1);
  const stroke = `${line} L ${lastX.toFixed(1)} ${lastY.toFixed(1)}`;
  // The same curve, closed down the sides to the floor, for the wash beneath.
  const area = `${stroke} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{label}</title>

      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.35" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={stroke}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // preserveAspectRatio="none" stretches the box, and would stretch the
        // stroke with it. This pins the stroke to 2 real pixels at any width.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
