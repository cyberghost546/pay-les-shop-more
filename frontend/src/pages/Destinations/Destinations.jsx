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
        <header className={styles.head}>
          <h2 className={styles.title}>{t('destination.indexTitle')}</h2>
          <p className={styles.subtitle}>{t('destination.indexSubtitle')}</p>
        </header>

        <ul className={styles.grid}>
          {DESTINATIONS.map((item) => (
            <li key={item.slug}>
              <Link to={`/destinations/${item.slug}`} className={styles.card}>
                <span
                  className={styles.thumb}
                  style={{ backgroundImage: `url(${item.hero})` }}
                  aria-hidden="true"
                />

                <span className={styles.body}>
                  <span className={styles.name}>{t(item.nameKey)}</span>

                  {/* The two things someone comparing islands actually wants,
                      rather than a photo and a name to click hopefully. */}
                  <span className={styles.facts}>
                    <span className={styles.fact}>
                      <span className={styles.factLabel}>
                        {t('destination.indexTransit')}
                      </span>
                      <span className={styles.factValue}>
                        {t('destination.indexDays').replace(
                          '{days}',
                          item.transitDays,
                        )}
                      </span>
                    </span>
                    <span className={styles.fact}>
                      <span className={styles.factLabel}>
                        {t('destination.indexArrives')}
                      </span>
                      <span className={styles.factValue}>{item.port}</span>
                    </span>
                  </span>

                  <span className={styles.more}>
                    {t('destination.indexMore')} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
