// src/components/Steps/Steps.jsx
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Steps.module.css';

// Inline line-art icons, one per stage of the journey: parcel handed over,
// flown out, shipped, delivered by an agent.
const STEPS = [
  {
    id: 'one',
    icon: (
      <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 18h32v20H8z" />
        <path d="M8 18l4-6h24l4 6" />
        <path d="M20 26h8" />
        <circle cx="24" cy="14" r="6" fill="#ffffff" />
        <path d="m21.4 14 1.9 1.9 3.4-3.6" />
      </svg>
    ),
  },
  {
    id: 'two',
    icon: (
      <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M6 22h10l6-8h5l-3 8h10l4-4h3l-2 6 2 6h-3l-4-4H24l3 8h-5l-6-8H6" />
        <path d="M4 30h6" />
        <path d="M2 26h5" />
      </svg>
    ),
  },
  {
    id: 'three',
    icon: (
      <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 32h32l-3 8H11Z" />
        <path d="M12 32V20h10v12" />
        <path d="M22 26h14v6H22z" />
        <path d="M15 20v-5h4v5" />
        <path d="M26 26v6M30 26v6M34 26v6" />
      </svg>
    ),
  },
  {
    id: 'four',
    icon: (
      <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="17" r="6" />
        <path d="M17 13h14" />
        <path d="M12 40v-4a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v4" />
        <path d="M21 28l3 5 3-5" />
      </svg>
    ),
  },
];

export default function Steps() {
  const { t } = useLanguage();

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('home.steps.title')}</h2>

      <ol className={styles.list}>
        {STEPS.map((step, index) => (
          <li key={step.id} className={styles.card}>
            <span className={styles.iconRing}>{step.icon}</span>
            <h3 className={styles.stepTitle}>
              {t('home.steps.step')} {index + 1}
            </h3>
            <p className={styles.text}>{t(`home.steps.${step.id}`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
