// src/components/LanguageSwitcher/flags.jsx
//
// The three flags on the language rail, drawn rather than typed.
//
// Not emoji. 🇳🇱 and its neighbours are the obvious way to do this and they do
// not work here: Windows ships no flag glyphs at all, so every visitor on a
// Windows desktop - which is most of the office, and a good share of
// customers - would see the letters "NL" in a box instead of a flag. An SVG
// renders the same everywhere and scales without going soft on a retina
// screen.
//
// A flag is not a language, which is worth saying out loud because it is the
// standard objection and it is a fair one. Papiamentu is spoken across three
// islands and English in dozens of countries, so no flag is ever exactly
// right. These earn their place because the rail is small, the audience knows
// these three flags on sight, and the full language name is still announced to
// a screen reader and shown on hover - see LanguageSwitcher.jsx.
//
// All three are drawn on a 60x30 canvas and cropped to a circle by the button
// around them, which means the outer sixth of each side is never seen. That is
// why the stars on the Curaçao flag sit further in than they do on the real
// thing: at their true position on the hoist they would be cropped away, and a
// flag whose distinguishing mark is missing is not a flag.

/** One five-pointed star, centred on the origin, one unit across. */
const STAR =
  'M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.3633,0.1181 L0.588,0.809 ' +
  'L0,0.382 L-0.588,0.809 L-0.3633,0.1181 L-0.951,-0.309 L-0.2245,-0.309 Z';

/**
 * Shared wrapper. `aria-hidden` on every flag: the button around it carries
 * the language name, and a second announcement of the same thing is noise.
 */
function Flag({ children }) {
  return (
    <svg
      viewBox="0 0 60 30"
      // Fills the circle and crops, rather than letter-boxing a 2:1 flag
      // inside a round hole with bands of dead space above and below.
      preserveAspectRatio="xMidYMid slice"
      // Sized by the button around it, through `.circle svg` in the
      // stylesheet, so a flag has no opinion about how big it is.
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Nederlands. */
export function FlagNL() {
  return (
    <Flag>
      <rect width="60" height="10" fill="#AE1C28" />
      <rect y="10" width="60" height="10" fill="#FFFFFF" />
      <rect y="20" width="60" height="10" fill="#21468B" />
    </Flag>
  );
}

/** English. */
export function FlagGB() {
  return (
    <Flag>
      <rect width="60" height="30" fill="#012169" />
      {/* The white diagonals, then the red ones drawn thinner on top of them.
          Clipping each red arm to its own quadrant is what gives the saltire
          its offset - without it the red would sit centred on the white and
          the flag would read as a plus sign with an X behind it. */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <clipPath id="lang-flag-gb-quadrants">
        <path d="M30,15 L60,15 L60,30 Z M30,15 L30,30 L0,30 Z M30,15 L0,15 L0,0 Z M30,15 L30,0 L60,0 Z" />
      </clipPath>
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath="url(#lang-flag-gb-quadrants)"
        stroke="#C8102E"
        strokeWidth="4"
      />
      {/* The upright cross, white first and red over it, same trick. */}
      <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </Flag>
  );
}

/** Papiamentu, under the flag of Curaçao. */
export function FlagCW() {
  return (
    <Flag>
      <rect width="60" height="30" fill="#002B7F" />
      <rect y="19" width="60" height="4" fill="#F9E814" />
      {/* Curaçao and Bonaire. Pulled in from the hoist so the circular crop
          cannot take them - see the note at the top of this file. */}
      <g fill="#FFFFFF">
        <path d={STAR} transform="translate(20 10) scale(5)" />
        <path d={STAR} transform="translate(28.5 17.5) scale(3.2)" />
      </g>
    </Flag>
  );
}
