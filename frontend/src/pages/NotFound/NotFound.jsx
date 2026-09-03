// src/pages/NotFound/NotFound.jsx
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './NotFound.module.css';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>{t('notFound.title')}</h1>
      <p className={styles.body}>{t('notFound.body')}</p>
      <Link to="/" className={styles.link}>
        {t('notFound.home')}
      </Link>
    </main>
  );
}
