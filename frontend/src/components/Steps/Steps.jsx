// src/components/Steps/Steps.jsx
//
// "How to order", as the client's own design lays it out: a bar per step, the
// icon on a tile at its left, and a round arrow at its end - in the site's
// blue, yellow and white rather than the design's orange. The design stacks
// the bars one under the other; here they run left to right, and only stack
// on a screen too narrow for five side by side - where the arrows turn to
// point down, as they do in the design.

import { useLanguage } from '../../i18n/useLanguage';
import styles from './Steps.module.css';

// Line icons for the tiles, one per step: an account, shopping, the payment
// details, the documents, and the parcel to collect.
const STEPS = [
  {
    id: 'account',
    icon: (
      <>
        <path d="M12 17h24v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3Z" />
        <path d="M18 17v-3a6 6 0 0 1 12 0v3" />
        <path d="m18.5 29.5 4 4 7-7.5" />
      </>
    ),
  },
  {
    id: 'shop',
    icon: (
      <>
        <path d="M3 9h5.5l5 21H34l3.5-13H10.4" />
        <circle cx="16" cy="37" r="2.6" />
        <circle cx="31" cy="37" r="2.6" />
        {/* The "+" badge: a disc in the icon's colour with the plus cut out
            in the tile's. */}
        <circle cx="38" cy="9" r="6.5" className={styles.iconFill} />
        <path d="M38 6v6M35 9h6" className={styles.iconCutout} />
      </>
    ),
  },
  {
    id: 'payment',
    icon: (
      <>
        {/* The card behind, drawn only where it shows past the front one. */}
        <path d="M14 30h-3a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3h22a3 3 0 0 1 3 3v4" />
        <rect x="14" y="19" width="28" height="19" rx="3" />
        <path d="M14 25h28M19 32h7" />
      </>
    ),
  },
  {
    id: 'documents',
    icon: (
      <>
        <path d="M13 22V8h22v14" />
        <path d="m19 14.5 3.5 3.5 6.5-7" />
        <path d="M6 20v18a3 3 0 0 0 3 3h30a3 3 0 0 0 3-3V20" />
        <path d="m6 20 18 12 18-12" />
      </>
    ),
  },
  {
    id: 'pickup',
    icon: (
      <>
        <path d="M26 6l15 7.5v17L26 38l-15-7.5v-17Z" />
        <path d="m11 13.5 15 7.5 15-7.5M26 21v17" />
        <path d="m18.5 9.8 15 7.4" />
        {/* Speed lines: on its way to you. */}
        <path d="M2 20h6M4 25h5M2 30h6" />
      </>
    ),
  },
];

export default function Steps() {
  const { t } = useLanguage();

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('home.steps.title')}</h2>

      {/* An <ol>: these are ordered steps, and the order is the point. */}
      <ol className={styles.list}>
        {STEPS.map((step) => (
          <li key={step.id} className={styles.step}>
            <span className={styles.tile} aria-hidden="true">
              <svg className={styles.icon} viewBox="0 0 48 48">
                {step.icon}
              </svg>
            </span>

            <h3 className={styles.label}>{t(`home.steps.${step.id}`)}</h3>

            <span className={styles.arrow} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" />
              </svg>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
