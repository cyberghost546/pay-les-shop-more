// src/components/ShopGrid/ShopGrid.jsx
//
// The shops a customer can order from, as a panel of cards beside the hero
// copy. It answers one question - "can you get me something from my shop?" -
// and leaves what happens next to the steps further down the page.
//
// The shops are in src/data/shops.js; the copy is under `home.shops`.

import { Link } from 'react-router-dom';
import { FEATURED_SHOPS, displayLogo } from '../../data/shops';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './ShopGrid.module.css';

/** One shop, as a card that is entirely a link to that shop's Dutch storefront. */
function ShopCard({ shop, cta }) {
  return (
    <li className={styles.item}>
      <a
        className={styles.card}
        href={shop.href}
        target="_blank"
        // noopener stops the shop's page reaching back through window.opener.
        rel="noopener noreferrer"
      >
        <span className={styles.logoWell}>
          <img
            // A logo on its own block of brand colour gets its corners
            // rounded, so it sits on the white card as a tile rather than as
            // a rectangle somebody forgot to cut out.
            className={shop.tile ? `${styles.logo} ${styles.logoTile}` : styles.logo}
            src={displayLogo(shop)}
            alt={shop.name}
            loading="lazy"
          />
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

export default function ShopGrid() {
  const { t } = useLanguage();

  return (
    <section className={styles.panel} aria-labelledby="shops-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="shops-title">
          {t('home.shops.title')}
        </h2>
        <p className={styles.lead}>{t('home.shops.lead')}</p>
      </div>

      <ul className={styles.grid}>
        {FEATURED_SHOPS.map((shop) => (
          <ShopCard key={shop.name} shop={shop} cta={t('home.shops.visit')} />
        ))}
      </ul>

      <Link className={styles.cta} to="/services">
        {t('home.shops.cta')}
      </Link>
    </section>
  );
}
