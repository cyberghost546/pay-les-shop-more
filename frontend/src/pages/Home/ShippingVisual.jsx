// src/pages/Home/ShippingVisual.jsx
import styles from './Home.module.css';

/**
 * The hero illustration: a cargo ship on a route between the Netherlands and
 * the islands, with containers, markers and a parcel travelling the line.
 *
 * Inline SVG with CSS animation rather than a canvas or a library. It is a
 * decorative diagram, so it is marked aria-hidden and the hero's headline
 * carries the meaning — and every animation stops under
 * prefers-reduced-motion, which the stylesheet handles.
 */
export default function ShippingVisual() {
  return (
    <div className={styles.visual} aria-hidden="true">
      <svg viewBox="0 0 520 420" className={styles.visualSvg}>
        <defs>
          <linearGradient id="seaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hullGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0b2545" />
            <stop offset="100%" stopColor="#1d4d7f" />
          </linearGradient>

          {/* The dashed route the parcel follows. Declared once and referenced
              by both the visible line and the motion path, so they can never
              drift apart. */}
          <path
            id="routeArc"
            d="M92 132 C 190 60, 330 96, 424 250"
            fill="none"
          />
        </defs>

        {/* Longitude/latitude grid, very faint: reads as "global" without
            pretending to be an accurate map. */}
        <g className={styles.grid}>
          {[60, 130, 200, 270, 340].map((y) => (
            <line key={y} x1="20" y1={y} x2="500" y2={y} />
          ))}
          {[80, 170, 260, 350, 440].map((x) => (
            <ellipse key={x} cx={x} cy="200" rx="46" ry="180" />
          ))}
        </g>

        <circle cx="260" cy="200" r="178" className={styles.globe} />

        {/* The route */}
        <use href="#routeArc" className={styles.routeBase} />
        <use href="#routeArc" className={styles.routeDash} />

        {/* Origin — Netherlands */}
        <g className={styles.marker} transform="translate(92 132)">
          <circle r="16" className={styles.markerHalo} />
          <circle r="6" className={styles.markerDot} />
          <text x="0" y="-26" textAnchor="middle" className={styles.markerLabel}>
            Nederland
          </text>
        </g>

        {/* Destination — the islands */}
        <g className={styles.marker} transform="translate(424 250)">
          <circle r="16" className={`${styles.markerHalo} ${styles.markerHaloLate}`} />
          <circle r="6" className={`${styles.markerDot} ${styles.markerDotEnd}`} />
          <text x="0" y="-26" textAnchor="middle" className={styles.markerLabel}>
            Curaçao
          </text>
        </g>

        {/* Two more destination pins, static, to say "more than one island" */}
        <g className={styles.marker} transform="translate(452 196)">
          <circle r="4" className={styles.markerSmall} />
        </g>
        <g className={styles.marker} transform="translate(392 306)">
          <circle r="4" className={styles.markerSmall} />
        </g>

        {/* A parcel travelling the route */}
        <g className={styles.parcel}>
          <animateMotion dur="9s" repeatCount="indefinite" rotate="auto">
            <mpath href="#routeArc" />
          </animateMotion>
          <rect x="-9" y="-9" width="18" height="18" rx="3" />
          <path d="M-9 -1h18M0 -9v18" className={styles.parcelTape} />
        </g>

        {/* The sea, and the ship on it */}
        <path
          d="M20 352 Q 130 336 260 352 T 500 352 L500 420 L20 420 Z"
          fill="url(#seaGradient)"
        />

        <g className={styles.ship}>
          {/* Containers, stacked. Three rows, offset, in the accent palette. */}
          <g className={styles.containers}>
            <rect x="182" y="300" width="34" height="15" rx="2" fill="#0ea5e9" />
            <rect x="220" y="300" width="34" height="15" rx="2" fill="#f59e0b" />
            <rect x="258" y="300" width="34" height="15" rx="2" fill="#22d3ee" />
            <rect x="200" y="283" width="34" height="15" rx="2" fill="#38bdf8" />
            <rect x="238" y="283" width="34" height="15" rx="2" fill="#0ea5e9" />
            <rect x="219" y="266" width="34" height="15" rx="2" fill="#f59e0b" />
          </g>

          {/* Bridge and hull */}
          <rect x="300" y="278" width="30" height="37" rx="3" fill="#dbeafe" />
          <rect x="306" y="286" width="18" height="6" rx="1" fill="#0b2545" />
          <path
            d="M168 316 h176 l-16 30 a10 10 0 0 1 -8 5 H184 a10 10 0 0 1 -8 -5 Z"
            fill="url(#hullGradient)"
          />
          <path d="M176 322h160" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
        </g>

        {/* Wake lines under the hull */}
        <g className={styles.wake}>
          <path d="M150 356h34" />
          <path d="M126 366h26" />
          <path d="M160 376h40" />
        </g>
      </svg>
    </div>
  );
}
