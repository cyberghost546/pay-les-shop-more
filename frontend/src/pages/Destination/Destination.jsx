// src/pages/Destination/Destination.jsx
import { Navigate, useParams } from 'react-router-dom';
import { findDestination } from '../../data/destinations';
import DestinationHero from '../../components/DestinationHero/DestinationHero';
import QuoteForm from '../../components/QuoteForm/QuoteForm';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Destination.module.css';

// The four stages, in order. Icons are inline so they inherit currentColor.
const STEPS = [
  {
    id: 'shopping',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 8h6l5 22h22" />
        <path d="M13 14h30l-3 12H15" />
        <circle cx="19" cy="38" r="3" />
        <circle cx="35" cy="38" r="3" />
      </svg>
    ),
  },
  {
    id: 'screenshot',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M6 18V6h12" />
        <path d="M42 18V6H30" />
        <path d="M6 30v12h12" />
        <path d="M42 30v12H30" />
        <path d="M6 6l14 14M42 6L28 20M6 42l14-14M42 42L28 28" />
      </svg>
    ),
  },
  {
    id: 'offer',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="4" y="11" width="40" height="26" rx="2" />
        <path d="m5 13 19 14 19-14" />
      </svg>
    ),
  },
  {
    id: 'shared',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M6 30h36c0 6-6 10-18 10S6 36 6 30Z" />
        <path d="M11 30V20h26v10" />
        <path d="M19 20v-6h10v6" />
      </svg>
    ),
  },
];

export default function Destination() {
  const { slug } = useParams();
  const { t } = useLanguage();

  const destination = findDestination(slug);

  // An unknown island in the URL goes to the index rather than a blank page.
  if (!destination) return <Navigate to="/destinations" replace />;

  const name = t(destination.nameKey);

  return (
    <main>
      <DestinationHero title={name} image={destination.hero} />

      {/* The white band runs edge to edge; the inner div holds the content to
          a readable width. */}
      <section className={styles.how}>
        <div className={styles.howInner}>
          <h2 className={styles.howTitle}>{t('destination.howTitle')}</h2>
          <p className={styles.howSubtitle}>
            {t('destination.howSubtitle')} {name}.
          </p>

          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.id} className={styles.step}>
                <span className={styles.icon}>{step.icon}</span>
                <h3 className={styles.stepTitle}>
                  {index + 1}. {t(`destination.steps.${step.id}.title`)}
                </h3>
                <p className={styles.stepText}>
                  {t(`destination.steps.${step.id}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <QuoteForm destination={name} />
    </main>
  );
}
