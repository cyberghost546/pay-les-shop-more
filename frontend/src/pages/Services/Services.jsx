// src/pages/Services/Services.jsx
import { Link } from 'react-router-dom';
import containerShip from '../../images/container-ship.webp';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Services.module.css';

// Inline SVGs: public/icons.svg only holds leftover Vite starter logos.
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

// Per-island service lists. The links are placeholders: point them at the real
// destinations once those pages exist.
const ISLANDS = [
  {
    name: 'Bonaire',
    services: ['Autodoc', 'Bol.com', 'BTW-vrij verzenden', 'Ikea', 'Shop and ship'],
  },
  {
    name: 'Curacao',
    services: [
      'Autodoc',
      'Bol.com',
      'Bruna',
      'BTW-vrij verzenden',
      'DA-drogist',
      'Ikea',
      'Rituals',
      'Online shopping',
      'Top 1 Toys',
    ],
  },
];

export default function Services() {
  const { t } = useLanguage();

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
          src={containerShip}
          alt="Container ship at sea loaded with freight"
          className={styles.bannerImage}
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

      <section className={styles.services}>
        <h2 className={styles.sectionTitle}>{t('services.sectionTitle')}</h2>

        <ul className={styles.cards}>
          {ISLANDS.map((island) => (
            <li key={island.name} className={styles.card}>
              <div>
                <h3 className={styles.cardTitle}>
                  {t('services.forIsland')} {island.name}
                </h3>
                <ul className={styles.serviceList}>
                  {island.services.map((service) => (
                    <li key={service} className={styles.serviceItem}>
                      <Link to="/services" className={styles.serviceLink}>
                        {service}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Swap for: <img src={map} alt="" className={styles.mapImage} /> */}
              <div className={styles.mapSlot}>
                Map of {island.name} — add the SVG to src/images/ and import it
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
