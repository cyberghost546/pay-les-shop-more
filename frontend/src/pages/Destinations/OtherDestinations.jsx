// src/pages/Destinations/OtherDestinations.jsx
//
// Everywhere we ship that has no page of its own.
//
// The five islands each have a page with photographs, transit times and a
// quote form, because that is most of the traffic. Everything else is a list
// of names and one way to ask about them, which is what somebody looking for
// Guyana on this page actually needs.
//
// Until now the "Overige bestemmingen" item in the menu led to the index of
// those same five islands, which answered a question nobody had asked.

import { Link } from 'react-router-dom';
import { destinationNames, inColumns } from '../../data/otherDestinations';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './OtherDestinations.module.css';

export default function OtherDestinations() {
  const { t, language } = useLanguage();

  usePageMeta(
    t('destination.otherTitle'),
    t('destination.otherLead'),
    '/destinations/other',
  );

  const columns = inColumns(destinationNames(language));

  return (
    <main className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link to="/" className={styles.crumbLink}>
          {t('nav.home')}
        </Link>{' '}
        &raquo; {t('destinations.other')}
      </p>

      <h1 className={styles.title}>{t('destinations.other')}</h1>
      <p className={styles.lead}>{t('destination.otherLead')}</p>

      {/* Three columns read downwards, so the alphabet runs the way somebody
          scanning for one name expects. Marked as one list rather than three:
          it is a single alphabetical list that happens to be set in columns,
          and a screen reader should hear it that way. */}
      <div className={styles.columns}>
        {columns.map((column) => (
          <ul key={column[0]} className={styles.column}>
            {column.map((name) => (
              <li key={name} className={styles.country}>
                {name}
              </li>
            ))}
          </ul>
        ))}
      </div>

      {/* The only thing to do on this page. A country in the list above is not
          a link, because there is no page behind it — this is. */}
      <Link to="/contact" className={styles.cta}>
        {t('destination.otherCta')}
      </Link>
    </main>
  );
}
