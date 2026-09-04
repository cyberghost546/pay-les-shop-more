// src/pages/Home/Home.jsx
//
// The homepage. Built from sections that each answer one question a visitor
// has, in the order they tend to ask them: what is this, where is my parcel,
// can I trust you, how does it work, where do you ship, what do you offer,
// what happens after I book, and how do I start.

import { Link } from 'react-router-dom';
import TrackingPanel from '../../components/TrackingPanel/TrackingPanel';
import ShipmentTimeline from '../../components/ShipmentTimeline/ShipmentTimeline';
import StatsBand from '../../components/StatsBand/StatsBand';
import Steps from '../../components/Steps/Steps';
import ShopAndShip from '../../components/ShopAndShip/ShopAndShip';
import ShippingVisual from './ShippingVisual';
import RouteMap from './RouteMap';
import { useInViewport } from '../../hooks/useInViewport';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Home.module.css';

// The services this company actually sells, not the freight-forwarder menu.
// Each links somewhere real; a card that goes nowhere is worse than no card.
const SERVICES = [
  { id: 'shopAndShip', to: '/services', icon: 'cart' },
  { id: 'consolidation', to: '/services', icon: 'boxes' },
  { id: 'doorToDoor', to: '/destinations', icon: 'truck' },
  { id: 'customs', to: '/services', icon: 'document' },
  { id: 'tracking', to: '/tracking', icon: 'pin' },
  { id: 'business', to: '/contact', icon: 'building' },
];

const ICONS = {
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

/** The stages of a shipment, for the explainer. Labels come from the API on
 *  the tracking page; here there is no shipment, so they are translated. */
const EXPLAINER_STAGES = [
  'paid',
  'purchased',
  'inTransit',
  'arrived',
  'delivered',
];

function Section({ children, className = '' }) {
  const [ref, seen] = useInViewport();

  return (
    <section
      ref={ref}
      className={`${styles.section} ${className} ${seen ? styles.revealed : ''}`}
    >
      {children}
    </section>
  );
}

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className={styles.page}>
      {/* 1. Hero ---------------------------------------------------------- */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{t('home.hero.eyebrow')}</p>
            <h1 className={styles.heroTitle}>{t('home.hero.title')}</h1>
            <p className={styles.heroLead}>{t('home.hero.lead')}</p>

            <div className={styles.heroButtons}>
              <a className={styles.primaryButton} href="#track">
                {t('home.hero.trackCta')}
              </a>
              <Link className={styles.ghostButton} to="/signup">
                {t('home.hero.startCta')}
              </Link>
            </div>
          </div>

          <ShippingVisual />
        </div>

        {/* 3. Tracking, inside the hero as the brief asks — it is the single
            most common reason a returning visitor opens the site. */}
        <div className={styles.heroTracking} id="track">
          <TrackingPanel variant="hero" />
        </div>
      </div>

      {/* 4. Live statistics ---------------------------------------------- */}
      <StatsBand />

      {/* 5. How it works — the existing Steps component, unchanged, which
          already tells this story in three languages. */}
      <Section className={styles.plain}>
        <Steps />
      </Section>

      {/* 6. Interactive map ----------------------------------------------- */}
      <RouteMap />

      {/* 7. Services ------------------------------------------------------ */}
      <Section>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{t('home.services.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('home.services.title')}</h2>
          <p className={styles.sectionLead}>{t('home.services.lead')}</p>
        </div>

        <div className={styles.serviceGrid}>
          {SERVICES.map((service) => (
            <Link key={service.id} to={service.to} className={styles.serviceCard}>
              <span className={styles.serviceIcon} aria-hidden="true">
                <svg viewBox="0 0 42 42">{ICONS[service.icon]}</svg>
              </span>
              <h3 className={styles.serviceTitle}>
                {t(`home.services.${service.id}.title`)}
              </h3>
              <p className={styles.serviceBody}>
                {t(`home.services.${service.id}.body`)}
              </p>
              <span className={styles.serviceLink}>
                {t('home.services.learnMore')} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 8. What happens to a shipment ------------------------------------ */}
      <Section className={styles.timelineSection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{t('home.journey.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('home.journey.title')}</h2>
          <p className={styles.sectionLead}>{t('home.journey.lead')}</p>
        </div>

        <div className={styles.timelineCard}>
          <ShipmentTimeline
            stages={EXPLAINER_STAGES.map((id) => ({
              value: id,
              label: t(`home.journey.stages.${id}`),
            }))}
            // Third of five, so the example shows a completed part, a current
            // stage and what is still to come — which is the point of showing
            // it at all.
            currentIndex={2}
          />
        </div>
      </Section>

      {/* The existing shop-and-ship explainer, kept as it was. */}
      <Section className={styles.plain}>
        <ShopAndShip />
      </Section>

      {/* 9. Closing call to action ---------------------------------------- */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>{t('home.cta2.title')}</h2>
          <p className={styles.ctaLead}>{t('home.cta2.lead')}</p>
          <div className={styles.heroButtons}>
            <Link className={styles.primaryButton} to="/signup">
              {t('home.cta2.start')}
            </Link>
            <Link className={styles.ghostButton} to="/tracking">
              {t('home.cta2.track')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
