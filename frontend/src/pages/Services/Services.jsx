// src/pages/Services/Services.jsx
//
// The page is four bands, in this order: the split banner, the yellow strip of
// selling points, one panel per island listing what is offered there, and the
// brands strip. That is the whole page — the rates table and the frequently
// asked questions that used to sit between them have been removed.

import { Link } from 'react-router-dom';
import { containerShip } from '../../images/optimized/photos';
import { BRANDS, ISLAND_SERVICES } from '../../data/islandServices';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
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

export default function Services() {
  const { t } = useLanguage();
  usePageMeta(t('services.title'), t('services.lead'), '/services');

  return (
    <>
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

      <ul className={styles.highlights}>
        {HIGHLIGHTS.map((item) => (
          <li key={item.labelKey} className={styles.highlight}>
            {item.icon}
            {t(item.labelKey)}
          </li>
        ))}
      </ul>

      {/* One panel per island ------------------------------------------- */}
      <section className={styles.islands}>
        <ul className={styles.islandGrid}>
          {ISLAND_SERVICES.map((island) => {
            const name = t(island.nameKey);

            return (
              <li key={island.slug} className={styles.islandCard}>
                <div className={styles.islandBody}>
                  <h2 className={styles.islandTitle}>
                    {t('services.forIsland')} {name}
                  </h2>

                  <ul className={styles.serviceList}>
                    {island.services.map((service) => (
                      <li key={service} className={styles.serviceItem}>
                        {/* The arrow is drawn, not typed: an arrow character
                            is read out as "downwards arrow with tip
                            rightwards" by a screen reader, once per line. */}
                        <svg
                          className={styles.serviceArrow}
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                        >
                          <path d="M3 2v7.5h9" />
                          <path d="m9 6.5 3.5 3L9 12.5" />
                        </svg>

                        {/* Every item leads to the island's own page, which is
                            where the quote form for it lives. The names are
                            shops rather than pages of this site, so sending
                            someone to bol.com from here would be sending them
                            away from the order they came to place. */}
                        <Link
                          to={`/destinations/${island.slug}`}
                          className={styles.serviceLink}
                        >
                          {service}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <img
                  src={island.hero.src}
                  srcSet={island.hero.srcSet}
                  sizes="(max-width: 900px) 100vw, 340px"
                  width={island.hero.width}
                  height={island.hero.height}
                  // Decorative: the panel is already titled with the island's
                  // name, and repeating it here would have a screen reader
                  // say it twice.
                  alt=""
                  className={styles.islandImage}
                  loading="lazy"
                  decoding="async"
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* The brands ------------------------------------------------------ */}
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
                // No logo file for this brand yet. See src/data/islandServices.js
                // for where one goes; until then the name carries the box.
                <span className={styles.brandName}>{brand.name}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
