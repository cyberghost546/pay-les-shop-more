// src/components/ShopAndShip/ShopAndShip.jsx
import { Link } from 'react-router-dom';
import containerShip from '../../images/container-ship.webp';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './ShopAndShip.module.css';

// Copy lives in src/i18n/translations.js; this holds only what does not
// translate — the destination, the artwork, and the alt text.
// `image: null` renders a labelled slot until the artwork exists.
const CARDS = [
  {
    id: 'particulier',
    href: '/services',
    image: null,
    imageAlt: '',
    slotLabel: 'Foto: pakketten in een winkelwagen',
  },
  {
    id: 'zakelijk',
    href: '/services',
    image: null,
    imageAlt: '',
    slotLabel: 'Foto: cadeau-illustratie',
  },
  {
    id: 'payless',
    href: '/services',
    image: containerShip,
    imageAlt: 'Containers gestapeld op een vrachtschip',
    slotLabel: '',
  },
];

export default function ShopAndShip() {
  const { t } = useLanguage();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('home.shopAndShip.title')}</h2>

      <ul className={styles.cards}>
        {CARDS.map((card) => {
          const title = t(`home.shopAndShip.${card.id}.title`);

          return (
            <li key={card.id} className={styles.card}>
              <div className={styles.body}>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.text}>
                  {t(`home.shopAndShip.${card.id}.body`)}
                </p>

                {/* Pushed to the bottom so the buttons line up across cards */}
                <Link to={card.href} className={styles.button}>
                  {t('home.shopAndShip.readMore')}
                  <span className={styles.srOnly}>
                    {' '}
                    {t('home.shopAndShip.readMoreAbout')} {title}
                  </span>
                </Link>
              </div>

              {card.image ? (
                <img
                  src={card.image}
                  alt={card.imageAlt}
                  className={styles.strip}
                  loading="lazy"
                />
              ) : (
                // Swap for an <img> once the artwork is in src/images/
                <div className={styles.stripSlot}>{card.slotLabel}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
