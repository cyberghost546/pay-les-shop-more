// src/pages/Privacy/Privacy.jsx
//
// The privacy statement. Text only, so the whole page is a heading band and
// one article of prose.
//
// The structure lives here and the words live in translations.js, the same
// split as every other page: this list is the order the sections are read in,
// which is a fact about the document rather than about Dutch, and it must not
// be able to differ between the three languages.
//
// Dutch is the original. The English and Papiamentu versions are translations
// for readability — if the wording of the policy itself is ever disputed, the
// Dutch is the text that was written.

import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './Privacy.module.css';

// `subsections` is what the original document does under "Ons gebruik van
// verzamelde gegevens": three headings that belong to it rather than following
// it, so they are nested here and rendered as <h3> under its <h2>.
const SECTIONS = [
  { id: 'use', subsections: ['services', 'communication', 'cookies'] },
  { id: 'purposes' },
  { id: 'thirdParties' },
  { id: 'changes' },
  { id: 'optOut' },
];

/** A heading and its paragraphs. `t` returns the body as an array of strings. */
function Prose({ id, level }) {
  const { t } = useLanguage();
  const Heading = level === 2 ? 'h2' : 'h3';
  const body = t(`privacy.sections.${id}.body`);

  return (
    <>
      <Heading className={level === 2 ? styles.heading : styles.subheading}>
        {t(`privacy.sections.${id}.heading`)}
      </Heading>
      {/* A section that only introduces the ones under it has no body of its
          own; Array.isArray keeps a missing key from rendering its own name. */}
      {Array.isArray(body) &&
        body.map((paragraph) => (
          <p key={paragraph} className={styles.paragraph}>
            {paragraph}
          </p>
        ))}
    </>
  );
}

export default function Privacy() {
  const { t } = useLanguage();
  const intro = t('privacy.intro');

  usePageMeta(t('privacy.title'), t('privacy.summary'), '/privacy');

  return (
    <main className={styles.page}>
      <header className={styles.banner}>
        <div className={styles.bannerInner}>
          <h1 className={styles.title}>{t('privacy.title')}</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            &raquo; {t('privacy.title')}
          </p>
        </div>
      </header>

      <article className={styles.article}>
        {intro.map((paragraph) => (
          <p key={paragraph} className={styles.lead}>
            {paragraph}
          </p>
        ))}

        {SECTIONS.map((section) => (
          <section key={section.id} className={styles.section}>
            <Prose id={section.id} level={2} />
            {section.subsections?.map((id) => (
              <Prose key={id} id={`${section.id}.${id}`} level={3} />
            ))}
          </section>
        ))}

        <p className={styles.contact}>
          {t('privacy.questions')}{' '}
          <Link to="/contact" className={styles.contactLink}>
            {t('nav.contact')}
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
