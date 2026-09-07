// src/pages/Services/Services.jsx
import { Link } from 'react-router-dom';
import containerShip from '../../images/container-ship.webp';
import { DESTINATIONS } from '../../data/destinations';
import { useLanguage } from '../../i18n/useLanguage';
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

// The same six the homepage advertises, and the same translation keys — every
// homepage card links here, so if the two lists drifted apart the page would
// not answer the question the card asked.
//
// Every card now leads somewhere: a card that describes a service and then
// leaves the reader with nowhere to go wastes the interest it just earned.
// `to` is a route; `href` is an anchor into a section further down this page.
const SERVICES = [
  { id: 'shopAndShip', icon: 'cart', to: '/booking' },
  { id: 'consolidation', icon: 'boxes', to: '/booking' },
  { id: 'doorToDoor', icon: 'truck', to: '/destinations' },
  { id: 'customs', icon: 'document', href: '#faq' },
  { id: 'tracking', icon: 'pin', to: '/tracking' },
  { id: 'business', icon: 'building', to: '/contact' },
];

// The call to action differs per card, so each link says what it actually
// does instead of repeating one generic "learn more" six times.
const SERVICE_ACTIONS = {
  shopAndShip: 'services.actions.book',
  consolidation: 'services.actions.book',
  doorToDoor: 'services.actions.destinations',
  customs: 'services.actions.faq',
  tracking: 'services.actions.track',
  business: 'services.actions.contact',
};

const SERVICE_ICONS = {
  cart: (
    <>
      <path d="M6 8h30l-3 16H10Z" />
      <path d="M6 8 4 3H1" />
      <circle cx="14" cy="32" r="3" />
      <circle cx="30" cy="32" r="3" />
    </>
  ),
  boxes: (
    <>
      <path d="M4 14h16v16H4zM24 14h16v16H24z" />
      <path d="M14 4h16v10H14z" />
    </>
  ),
  truck: (
    <>
      <path d="M3 10h22v18H3z" />
      <path d="M25 16h7l5 6v6h-12z" />
      <circle cx="11" cy="31" r="3" />
      <circle cx="30" cy="31" r="3" />
    </>
  ),
  document: (
    <>
      <path d="M9 3h16l8 8v26H9z" />
      <path d="M25 3v8h8" />
      <path d="M15 21h12M15 27h8" />
    </>
  ),
  pin: (
    <>
      <path d="M21 4a12 12 0 0 1 12 12c0 8-12 21-12 21S9 24 9 16A12 12 0 0 1 21 4Z" />
      <circle cx="21" cy="16" r="4.5" />
    </>
  ),
  building: (
    <>
      <path d="M6 37V7h18v30" />
      <path d="M24 17h12v20" />
      <path d="M11 13h8M11 20h8M11 27h8M29 23h3M29 29h3" />
    </>
  ),
};

/* ------------------------------------------------------------------ rates */

// PLACEHOLDER RATES — replace `price` with the real tariff before publishing.
// Nothing else on the site quotes a price: the booking form notes that weight
// and volume are assessed at the counter afterwards, so these are advertised
// as indicative and the written quote stays the binding number. Keeping them
// in one constant makes the real figures a single edit, in one place.
const RATE_TIERS = [
  { id: 'parcel', price: '€ 25', featured: false },
  { id: 'box', price: '€ 60', featured: true },
  { id: 'pallet', price: '€ 180', featured: false },
];

// What actually moves the price, shown under the table so the numbers above
// read as a starting point rather than a promise.
const RATE_FACTORS = ['volume', 'destination', 'insurance'];

/* ------------------------------------------------------------------ shops */

// Shops customers order from most, grouped so the block answers "can I order
// the kind of thing I want?" instead of just listing twelve names.
//
// Brand names, so they are not translated — and not links: sending someone to
// bol.com from here would be sending them away from the order they came to
// place.
const SHOP_GROUPS = [
  { id: 'general', shops: ['Bol.com', 'Wehkamp'] },
  { id: 'electronics', shops: ['Coolblue', 'MediaMarkt'] },
  { id: 'fashion', shops: ['Zalando', 'IKEA'] },
  { id: 'beauty', shops: ['Rituals', 'DA Drogist'] },
  { id: 'kids', shops: ['Top 1 Toys', 'Prénatal'] },
  { id: 'specialist', shops: ['Autodoc', 'Bruna'] },
];

/* -------------------------------------------------------------------- faq */

const FAQ_IDS = ['transit', 'customs', 'vat', 'prohibited', 'insurance'];

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

      {/* What we actually do ------------------------------------------- */}
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('services.sectionTitle')}</h2>
          <p className={styles.sectionLead}>{t('services.lead')}</p>
        </header>

        <ul className={styles.serviceGrid}>
          {SERVICES.map((service) => (
            <li key={service.id}>
              {/* The customs card points at the FAQ below, which is where that
                  question is actually answered. An in-page jump is a plain
                  <a>: react-router's Link would push a history entry for a
                  move within the same document. */}
              {service.href ? (
                <a href={service.href} className={styles.serviceCard}>
                  <ServiceBody service={service} t={t} />
                </a>
              ) : (
                <Link to={service.to} className={styles.serviceCard}>
                  <ServiceBody service={service} t={t} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* What it costs --------------------------------------------------- */}
      <section className={styles.rates}>
        <div className={styles.ratesInner}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t('services.rates.title')}</h2>
            <p className={styles.sectionLead}>{t('services.rates.lead')}</p>
          </header>

          <ul className={styles.rateGrid}>
            {RATE_TIERS.map((tier) => (
              <li
                key={tier.id}
                className={
                  tier.featured
                    ? `${styles.rateCard} ${styles.rateCardFeatured}`
                    : styles.rateCard
                }
              >
                {tier.featured && (
                  <span className={styles.rateBadge}>
                    {t('services.rates.popular')}
                  </span>
                )}
                <h3 className={styles.rateName}>
                  {t(`services.rates.tiers.${tier.id}.name`)}
                </h3>
                <p className={styles.rateSize}>
                  {t(`services.rates.tiers.${tier.id}.size`)}
                </p>
                <p className={styles.ratePrice}>
                  <span className={styles.rateFrom}>{t('services.rates.from')}</span>
                  {tier.price}
                </p>
                <p className={styles.rateText}>
                  {t(`services.rates.tiers.${tier.id}.body`)}
                </p>
              </li>
            ))}
          </ul>

          <div className={styles.rateFactors}>
            <h3 className={styles.rateFactorsTitle}>
              {t('services.rates.factorsTitle')}
            </h3>
            <ul className={styles.rateFactorList}>
              {RATE_FACTORS.map((factor) => (
                <li key={factor} className={styles.rateFactor}>
                  {t(`services.rates.factors.${factor}`)}
                </li>
              ))}
            </ul>
          </div>

          {/* The written quote, not this table, is the number that counts. */}
          <p className={styles.rateNote}>{t('services.rates.note')}</p>

          <Link to="/booking" className={styles.rateCta}>
            {t('services.rates.cta')}
          </Link>
        </div>
      </section>

      {/* Where we ship -------------------------------------------------- */}
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('services.islandsTitle')}</h2>
          <p className={styles.sectionLead}>{t('services.islandsLead')}</p>
        </header>

        {/* Driven by the shared island list, so adding an island updates the
            header menu, the destinations index and this page together. */}
        <ul className={styles.islandGrid}>
          {DESTINATIONS.map((island) => (
            <li key={island.slug}>
              <Link
                to={`/destinations/${island.slug}`}
                className={styles.islandCard}
              >
                <img
                  src={island.hero}
                  alt=""
                  className={styles.islandImage}
                  loading="lazy"
                />
                <span className={styles.islandBody}>
                  <span className={styles.islandName}>{t(island.nameKey)}</span>
                  <span className={styles.islandMore}>
                    {t('services.viewDestination')} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Shops people order from ---------------------------------------- */}
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('services.shopsTitle')}</h2>
          <p className={styles.sectionLead}>{t('services.shopsLead')}</p>
        </header>

        <ul className={styles.shopGroups}>
          {SHOP_GROUPS.map((group) => (
            <li key={group.id} className={styles.shopGroup}>
              <h3 className={styles.shopGroupTitle}>
                {t(`services.shops.${group.id}.title`)}
              </h3>
              <p className={styles.shopGroupNote}>
                {t(`services.shops.${group.id}.note`)}
              </p>
              <ul className={styles.shopList}>
                {group.shops.map((shop) => (
                  <li key={shop} className={styles.shop}>
                    {shop}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className={styles.shopsFooter}>{t('services.shopsFooter')}</p>
      </section>

      {/* Questions we get asked most ------------------------------------ */}
      {/* Plain <details>, so it opens without JavaScript and the browser
          handles the keyboard and screen-reader behaviour correctly — the
          same pattern the destination pages use for their own questions. */}
      <section className={styles.faq} id="faq">
        <div className={styles.faqInner}>
          <h2 className={styles.faqTitle}>{t('services.faq.title')}</h2>

          <div className={styles.faqList}>
            {FAQ_IDS.map((id) => (
              <details key={id} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>
                  {t(`services.faq.${id}.q`)}
                  <span className={styles.faqChevron} aria-hidden="true" />
                </summary>
                <p className={styles.faqAnswer}>{t(`services.faq.${id}.a`)}</p>
              </details>
            ))}
          </div>

          <p className={styles.faqMore}>
            {t('services.faq.more')}{' '}
            <Link to="/contact" className={styles.faqLink}>
              {t('services.faq.contact')}
            </Link>
          </p>
        </div>
      </section>

      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>{t('services.ctaTitle')}</h2>
        <p className={styles.ctaBody}>{t('services.ctaBody')}</p>
        <div className={styles.ctaButtons}>
          <Link to="/contact" className={styles.ctaPrimary}>
            {t('services.ctaPrimary')}
          </Link>
          <Link to="/destinations" className={styles.ctaGhost}>
            {t('services.ctaSecondary')}
          </Link>
        </div>
      </section>
    </>
  );
}

/** The inside of a service card, shared by the routed and anchored versions. */
function ServiceBody({ service, t }) {
  return (
    <>
      <span className={styles.serviceIcon} aria-hidden="true">
        <svg viewBox="0 0 42 42">{SERVICE_ICONS[service.icon]}</svg>
      </span>
      <h3 className={styles.serviceTitle}>
        {t(`home.services.${service.id}.title`)}
      </h3>
      <p className={styles.serviceText}>{t(`home.services.${service.id}.body`)}</p>
      <span className={styles.serviceMore}>
        {t(SERVICE_ACTIONS[service.id])} <span aria-hidden="true">→</span>
      </span>
    </>
  );
}
