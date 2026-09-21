// src/components/RobotGuide/RobotGuide.jsx
//
// The little assistant that walks a visitor through the site. Drawn as inline
// SVG rather than shipped as an image or a video, for three reasons: it stays
// sharp at any size, it weighs nothing, and its parts can be animated on their
// own — the mouth only moves while the voice is actually speaking, which is
// what makes it read as the robot talking rather than a looping cartoon.
//
// Everything decorative is hidden from screen readers. What the robot "says"
// is the step text on the page, which is real, selectable copy.

import styles from './RobotGuide.module.css';

/**
 * @param {object} props
 * @param {boolean} [props.speaking] mouth and antenna animate while true
 * @param {boolean} [props.waving] raised arm gives a greeting swing
 * @param {string} [props.className]
 */
export default function RobotGuide({ speaking = false, waving = false, className }) {
  const classes = [styles.robot, speaking && styles.isSpeaking, className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      viewBox="0 0 240 280"
      className={classes}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Cool white with a lavender underside, as on a moulded plastic shell */}
        <linearGradient id="rg-shell" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eef1fb" />
          <stop offset="100%" stopColor="#c9d2ee" />
        </linearGradient>
        <linearGradient id="rg-body" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e8ecf9" />
          <stop offset="100%" stopColor="#bcc7e8" />
        </linearGradient>
        <linearGradient id="rg-visor" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#2b2a4a" />
          <stop offset="100%" stopColor="#14132b" />
        </linearGradient>
        {/* The hover light under the robot */}
        <radialGradient id="rg-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#47e3ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#47e3ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Stays put while the robot bobs above it, so the float reads as hover */}
      <ellipse cx="120" cy="266" rx="34" ry="9" fill="url(#rg-glow)" />

      <g className={styles.float}>
        {/* Arms first: they tuck behind the body */}
        <g className={waving ? styles.armWave : styles.armRight}>
          <rect x="176" y="150" width="26" height="64" rx="13" fill="url(#rg-shell)" />
          <path d="M180 186h18" stroke="#8f9cc6" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <g className={styles.armLeft}>
          <rect x="38" y="152" width="26" height="62" rx="13" fill="url(#rg-shell)" />
          <path d="M42 188h18" stroke="#8f9cc6" strokeWidth="1.4" strokeLinecap="round" />
        </g>

        {/* Body: a teardrop — broad at the shoulders, tapering to a rounded
            point under the thruster */}
        <path
          d="M120 140c33 0 56 24 56 54 0 32-23 56-41 68a26 26 0 0 1-30 0c-18-12-41-36-41-68 0-30 23-54 56-54Z"
          fill="url(#rg-body)"
        />
        {/* Collar ring where the head sits on the body */}
        <ellipse cx="120" cy="146" rx="32" ry="10" fill="#dfe6f8" />
        <ellipse cx="120" cy="144" rx="26" ry="7" fill="#6fe3f5" opacity="0.7" />
        {/* Thruster underneath */}
        <ellipse cx="120" cy="252" rx="13" ry="5" fill="#7ee8ff" opacity="0.85" />

        {/* Ear pods */}
        <ellipse cx="44" cy="92" rx="15" ry="22" fill="#c3cdec" />
        <ellipse cx="196" cy="92" rx="15" ry="22" fill="#c3cdec" />

        {/* Head */}
        <rect x="40" y="26" width="160" height="124" rx="60" fill="url(#rg-shell)" />
        {/* Visor */}
        <ellipse cx="120" cy="86" rx="62" ry="46" fill="url(#rg-visor)" />
        <ellipse cx="96" cy="60" rx="26" ry="13" fill="#ffffff" opacity="0.07" />

        {/* Eyes. The blink is a squash of the whole pair, in step. */}
        <g className={styles.eyes}>
          <ellipse cx="98" cy="82" rx="11" ry="15" fill="#5ce1ff" />
          <ellipse cx="142" cy="82" rx="11" ry="15" fill="#5ce1ff" />
        </g>

        {/* Mouth: a half-disc that opens and closes while the voice runs */}
        <g className={styles.mouth}>
          <path d="M104 106h32a16 16 0 0 1-32 0Z" fill="#5ce1ff" />
        </g>

        {/* Headset: band over the left pod and the boom mic along the cheek */}
        <path
          d="M46 74c-12 10-14 34-4 46 8 10 22 14 34 10"
          fill="none"
          stroke="#2f3550"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <ellipse cx="80" cy="128" rx="9" ry="6" fill="#2f3550" transform="rotate(-12 80 128)" />
      </g>
    </svg>
  );
}
