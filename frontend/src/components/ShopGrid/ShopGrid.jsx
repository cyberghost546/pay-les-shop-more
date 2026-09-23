// src/components/ShopGrid/ShopGrid.jsx
//
// The shops a customer can order from, as two rows of cards that slide past
// beside the hero copy. It answers one question - "can you get me something
// from my shop?" - and leaves what happens next to the steps further down.
//
// Both rows travel leftwards, so a new shop enters from the right and reads
// the way the text beside it does. They run at different speeds: at the same
// speed the two rows march in lockstep and read as one block sliding, which
// is the thing that makes a marquee look cheap. It is a loop rather than a
// carousel with controls - there is nothing to choose between, so a control
// would be a decision nobody wants to make.
//
// Each row's shops are rendered twice. The animation slides exactly half the
// track, so the moment the first copy has left the second is sitting where it
// began and the seam never shows. The second copy is hidden from assistive
// technology and taken out of the tab order - it is the same shops, and
// hearing or tabbing through them twice would be a bug, not a feature.
//
// The shops come from the API the office edits in the dashboard, through
// useShops - so adding a shop there adds it here, with no code change. Until
// that request answers, and if it fails, the bundled list in
// src/data/shops.js stands in. The copy is under `home.shops`.

import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { useShops } from '../../hooks/useShops';
import styles from './ShopGrid.module.css';

// How many cards a row needs before it is longer than the panel it slides
// behind. With fewer shops than this the row is repeated until it is, or a
// short list would slide off and leave a gap before it came round again.
const MIN_PER_ROW = 4;

/**
 * One shop, as a logo that links to that shop's Dutch storefront.
 *
 * No card around it: the logos sit straight on the strip, the way a "these
 * are the shops" row is usually set. Every one of these files is opaque with
 * its own white or brand-coloured background baked in, which is the reason
 * the strip below them is light - on the navy each logo would show as a
 * rectangle rather than as a mark.
 *
 * `clone` marks the duplicate half of the track: same markup, but invisible
 * to a screen reader and unreachable by tab.
 */
function ShopCard({ shop, clone = false }) {
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

      </a>
    </li>
  );
}

/**
 * One sliding row: its shops, then the same shops again so the loop closes.
 *
 * @param {{ shops: object[], cta: string, speed: string }} props `speed` is
 *   how long one full pass takes, and is what keeps the two rows from
 *   travelling in lockstep.
 */
function MarqueeRow({ shops, speed }) {
  // Repeated until the row is longer than its window, so a short list still
  // fills it. Two shops become two runs of two, then doubled again below for
  // the loop itself.
  const filled = [];
  while (filled.length < MIN_PER_ROW) filled.push(...shops);

  return (
    <ul className={styles.track} style={{ animationDuration: speed }}>
      {filled.map((shop, index) => (
        <ShopCard key={`${shop.id}-${index}`} shop={shop} />
      ))}
      {filled.map((shop, index) => (
        <ShopCard key={`clone-${shop.id}-${index}`} shop={shop} clone />
      ))}
    </ul>
  );
}

export default function ShopGrid() {
  const { t } = useLanguage();
  const { shops } = useShops();

  // Split down the middle, in the office's own running order: the first half
  // on the top row, the second on the bottom. A single shop keeps one row
  // rather than leaving an empty one under it.
  const half = Math.ceil(shops.length / 2);
  const topRow = shops.slice(0, half);
  const bottomRow = shops.slice(half);

  return (
    <section className={styles.panel} aria-labelledby="shops-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="shops-title">
          {t('home.shops.title')}
        </h2>
        <p className={styles.lead}>{t('home.shops.lead')}</p>
      </div>

      {/* The window the rows slide behind. Its edges are faded by CSS, so a
          card arrives and leaves rather than appearing at a hard border. */}
      <div className={styles.marquee}>
        <MarqueeRow shops={topRow} speed="16s" />
        {bottomRow.length > 0 && (
          <MarqueeRow shops={bottomRow} speed="21s" />
        )}
      </div>

      <Link className={styles.cta} to="/services">
        {t('home.shops.cta')}
      </Link>
    </section>
  );
}
