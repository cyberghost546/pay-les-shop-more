// src/pages/Destinations/Destinations.jsx
import { Link } from 'react-router-dom';
import { DESTINATIONS } from '../../data/destinations';
import DestinationHero from '../../components/DestinationHero/DestinationHero';
import portHaven from '../../images/port-haven-ship.jpeg';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Destinations.module.css';

export default function Destinations() {
  const { t } = useLanguage();

  return (
    <main>
      <DestinationHero title={t('destinations.other')} image={portHaven} />

      <section className={styles.page}>
        <h2 className={styles.title}>{t('destination.indexTitle')}</h2>
        <p className={styles.subtitle}>{t('destination.indexSubtitle')}</p>

        <ul className={styles.grid}>
          {DESTINATIONS.map((item) => (
            <li key={item.slug}>
              <Link to={`/destinations/${item.slug}`} className={styles.card}>
                <span
                  className={
                    item.hero
                      ? styles.thumb
                      : `${styles.thumb} ${styles.thumbPlain}`
                  }
                  style={
                    item.hero
                      ? { backgroundImage: `url(${item.hero})` }
                      : undefined
                  }
                  aria-hidden="true"
                />
                <span className={styles.name}>{t(item.nameKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
