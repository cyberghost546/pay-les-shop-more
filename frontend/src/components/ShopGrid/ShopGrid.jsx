// src/components/ShopGrid/ShopGrid.jsx
//
// The shops a customer can order from, as one row of cards sliding past under
// the hero copy, the full width of the hero. It answers one question - "can
// you get me something from my shop?" - and leaves what happens next to the
// steps further down.
//
// The row travels leftwards, so a new shop enters from the right and reads
// the way the text above it does. It is a loop rather than a carousel with
// controls - there is nothing to choose between, so a control would be a
// decision nobody wants to make.
//
// The shops are rendered twice. The animation slides exactly half the track,
// so the moment the first copy has left the second is sitting where it began
// and the seam never shows. Only the first appearance of each shop is
// announced and reachable by tab; every repeat - the second copy, and any
// fill for a short list - is hidden from assistive technology and taken out
// of the tab order. Hearing or tabbing through the same shops twice would be
// a bug, not a feature.
//
// The shops come from the API the office edits in the dashboard, through
// useShops - so adding a shop there adds it here, with no code change. Until
// that request answers, and if it fails, the bundled list in
// src/data/shops.js stands in. The copy is under `home.shops`.

import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { useShops } from '../../hooks/useShops';
import styles from './ShopGrid.module.css';

// How many cards the row needs before it is longer than the window it slides
// behind: 1400px wide at most, at 170px a card with its gap. With fewer shops
// than this the row is repeated until it is, or a short list would slide off
// and leave a gap before it came round again.
const MIN_CARDS = 9;

// How long each card takes to travel its own width, gap included. The loop's
// duration follows from it, so the row moves at the same pace however many
// shops the office has added - about 48px a second.
const SECONDS_PER_CARD = 3.5;

/**
 * One shop, as a card that is entirely a link to that shop's Dutch storefront.
 *
 * `clone` marks the duplicate half of the track: same markup, but invisible
 * to a screen reader and unreachable by tab.
 */
function ShopCard({ shop, cta, clone = false }) {
  return (
    <li className={styles.item} aria-hidden={clone || undefined}>
      <a
        className={styles.card}
        href={shop.url}
        target="_blank"
        // noopener stops the shop's page reaching back through window.opener.
        rel="noopener noreferrer"
        tabIndex={clone ? -1 : undefined}
      >
        <span className={styles.logoWell}>
          {shop.logo ? (
            <img
              // A logo on its own block of brand colour gets its corners
              // rounded, so it sits on the white card as a tile rather than
              // as a rectangle somebody forgot to cut out.
              className={shop.tile ? `${styles.logo} ${styles.logoTile}` : styles.logo}
              src={shop.logo}
              alt={shop.name}
              loading="lazy"
            />
          ) : (
            // A shop the office has added but not yet given a logo.
            <span className={styles.logoName}>{shop.name}</span>
          )}
        </span>

        {/* Shown on hover and whenever the card has keyboard focus, so it is
            not a mouse-only affordance. */}
        <span className={styles.cardCta} aria-hidden="true">
          {cta}
          <svg viewBox="0 0 24 24" className={styles.cardArrow} focusable="false">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </li>
  );
}

/**
 * The sliding row: its shops, then the same shops again so the loop closes.
 *
 * @param {{ shops: object[], cta: string }} props the shops in the office's
 *   own running order.
 */
function MarqueeRow({ shops, cta }) {
  // Repeated until the row is longer than its window, so a short list still
  // fills it. Three shops become three runs of three, then doubled again
  // below for the loop itself.
  const filled = [];
  while (filled.length < MIN_CARDS) filled.push(...shops);

  return (
    <ul
      className={styles.track}
      style={{ animationDuration: `${filled.length * SECONDS_PER_CARD}s` }}
    >
      {filled.map((shop, index) => (
        <ShopCard
          key={`${shop.id}-${index}`}
          shop={shop}
          cta={cta}
          // Past the first run, a repeat put there only to fill the window.
          clone={index >= shops.length}
        />
      ))}
      {filled.map((shop, index) => (
        <ShopCard key={`clone-${shop.id}-${index}`} shop={shop} cta={cta} clone />
      ))}
    </ul>
  );
}

export default function ShopGrid() {
  const { t } = useLanguage();
  const { shops } = useShops();

  return (
    <section className={styles.panel} aria-labelledby="shops-title">
      {/* A caption over the logos rather than a headline: the hero's own
          title is right above it. */}
      <h2 className={styles.title} id="shops-title">
        {t('home.shops.title')}
      </h2>

      {/* The window the row slides behind. Its edges are faded by CSS, so a
          card arrives and leaves rather than appearing at a hard border. */}
      {shops.length > 0 && (
        <div className={styles.marquee}>
          <MarqueeRow shops={shops} cta={t('home.shops.visit')} />
        </div>
      )}

      <Link className={styles.cta} to="/services">
        {t('home.shops.cta')}
        <span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}
