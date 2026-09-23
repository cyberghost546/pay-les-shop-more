// src/pages/Services/Services.jsx
//
// The services page, in six bands: the split banner, the yellow strip of
// selling points, the three islands as photographs, the companies whose
// services are offered, the brands strip, and a closing call to action.
//
// The island cards carry the island drawn in its own flag, and nothing else -
// no photograph, no name, no caption, no button. The shape is the label: it
// says which island without a word of text on the card. They are still links,
// and still named for a screen reader through the drawing's alt text, because
// a card that can be clicked has to be reachable and announced; none of that
// shows on screen.
//
// The companies grid is the shops the office maintains in the dashboard,
// read through useShops - which falls back to the bundled list in
// src/data/shops.js while the request is in flight or if it fails.

import { Link } from 'react-router-dom';
import { containerShip } from '../../images/optimized/photos';
import { DESTINATIONS } from '../../data/destinations';
import { SHOPS } from '../../data/shops';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useShops } from '../../hooks/useShops';
import styles from './Services.module.css';

// Inline SVGs: public/icons.svg only holds the footer's social logos.
const HIGHLIGHTS = [
  {
    labelKey: 'services.highlights.vat',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a6 6 0 0 1 6-6h4a6 6 0 0 1 5.2 3H21v4h-2.2a6 6 0 0 1-1.8 2.2V19h-3v-1.2H12V19H9v-2.3A6 6 0 0 1 6 13H4.5A1.5 1.5 0 0 1 3 11.5Z" />
        <path d="M9 6V5a2.5 2.5 0 0 1 4 0" />
        <circle cx="15.5" cy="10.5" r=".6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    labelKey: 'services.highlights.products',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m2 11 3-3 4.2 1.3a2 2 0 0 0 1.6-.2L13 8l6 4.5" />
        <path d="M13 8h4.5L22 11" />
        <path d="M11 16.5 9 15a1.5 1.5 0 0 1 .3-2.4l1.7-1" />
        <path d="m11 16.5 1.7 1.3a1.4 1.4 0 0 0 2-.3l3.6-4.6" />
      </svg>
    ),
  },
  {
    labelKey: 'services.highlights.transport',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 7h11v9H2z" />
        <path d="M13 10h4.5l3.5 3v3h-8z" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </svg>
    ),
  },
];

/** The brands strip: the same shops the home page leads with, from ./shops.js. */
const BRANDS = SHOPS.map(({ name, logo }) => ({ name, logo: logo ?? null }));

/** One island, as its flag map, linking to that island's own page. */
function IslandCard({ island, name }) {
  return (
    <li className={styles.islandItem}>
      <Link to={`/destinations/${island.slug}`} className={styles.islandCard}>
        {/* A flat drawing on a transparent ground, imported at full size
            rather than put through `npm run images`: re-encoding flat colour
            as WebP would not make it smaller, and it has to stay crisp at
            whatever size the card lands on. */}
        <img
          src={island.flagMap}
          // The only place the island is named. It is not drawn on the card -
          // it is what a screen reader reads in place of the picture.
          alt={name}
          className={styles.islandFlag}
          loading="lazy"
          decoding="async"
        />
      </Link>
    </li>
  );
}

/** One shop, as a card that links out to that shop's own site. */
function ShopCard({ shop, cta }) {
  return (
    <li className={styles.companyItem}>
      <article className={styles.companyCard}>
        {shop.logo ? (
          <img
            className={styles.companyLogo}
            src={shop.logo}
            alt={shop.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          // A shop the office has added but not yet given a logo. A lettered
          // plate keeps the grid even instead of leaving a card that has
          // visibly lost its picture.
          <span className={styles.companyPlate} aria-hidden="true">
            {shop.name.charAt(0)}
          </span>
        )}

        <h3 className={styles.companyName}>{shop.name}</h3>

        {shop.description && (
          <p className={styles.companyBlurb}>{shop.description}</p>
        )}

        <a
          className={styles.companyCta}
          href={shop.url}
          target="_blank"
          // noopener stops the shop's page reaching back through window.opener.
          rel="noopener noreferrer"
        >
          {cta}
        </a>
      </article>
    </li>
  );
}

export default function Services() {
  const { t } = useLanguage();
  const { shops } = useShops();
  usePageMeta(t('services.sectionTitle'), t('services.hero.lead'), '/services');

  return (
    <main>
      {/* 1. The split banner --------------------------------------------- */}
      <section className={styles.banner}>
        <div className={styles.titlePanel}>
          <p className={styles.eyebrow}>{t('services.eyebrow')}</p>
          <h1 className={styles.title}>{t('services.title')}</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            &raquo; {t('services.breadcrumb')}
          </p>
        </div>

        <img
          src={containerShip.src}
          srcSet={containerShip.srcSet}
          // Full-bleed banner, so the slot really is the window's width.
          sizes="100vw"
          width={containerShip.width}
          height={containerShip.height}
          alt="Container ship at sea loaded with freight"
          className={styles.bannerImage}
          // Top of the page: the visitor is looking at it before it loads.
          fetchPriority="high"
          decoding="async"
        />
      </section>

      {/* 2. The yellow strip of selling points --------------------------- */}
      <ul className={styles.highlights}>
        {HIGHLIGHTS.map((item) => (
          <li key={item.labelKey} className={styles.highlight}>
            {item.icon}
            {t(item.labelKey)}
          </li>
        ))}
      </ul>

      {/* Everything below runs on the navy, as one band. */}
      <div className={styles.page}>
        {/* 3. The islands, as photographs and nothing else --------------- */}
        <section className={styles.islands}>
          <p className={styles.intro}>{t('services.hero.lead')}</p>

          {/* The label sits on the list, not the section: it is the list that
              has to be findable and announced, since its items carry no text
              of their own to go by. */}
          <ul
            className={styles.islandGrid}
            aria-label={t('services.islandsLabel')}
          >
            {DESTINATIONS.map((island) => (
              <IslandCard
                key={island.slug}
                island={island}
                name={t(island.nameKey)}
              />
            ))}
          </ul>
        </section>

        {/* 4. The companies --------------------------------------------- */}
        <section className={styles.companies} aria-labelledby="companies-title">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="companies-title">
              {t('services.companies.title')}
            </h2>
            <p className={styles.sectionLead}>{t('services.companies.lead')}</p>
          </div>

          <ul className={styles.companyGrid}>
            {shops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                cta={t('services.companies.cta')}
              />
            ))}
          </ul>
        </section>

        {/* 5. The brands ------------------------------------------------- */}
        <section className={styles.brands}>
          <h2 className={styles.brandsTitle}>{t('services.brandsTitle')}</h2>

          {/* Scrolls sideways rather than wrapping, and says so to a screen
              reader: a region with tabIndex is reachable by keyboard, which is
              what lets somebody not using a mouse scroll it at all. */}
          <ul
            className={styles.brandRow}
            tabIndex={0}
            role="group"
            aria-label={t('services.brandsTitle')}
          >
            {BRANDS.map((brand) => (
              <li key={brand.name} className={styles.brandCard}>
                {brand.logo ? (
                  <img
                    src={brand.logo}
                    alt={brand.name}
                    className={styles.brandLogo}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  // No logo file for this brand yet. See src/data/shops.js for
                  // where one goes; until then the name carries the box.
                  <span className={styles.brandName}>{brand.name}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* 6. Closing call to action ------------------------------------- */}
        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>{t('services.contactCta.title')}</h2>
            <Link className={styles.ctaButton} to="/contact">
              {t('services.contactCta.button')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
