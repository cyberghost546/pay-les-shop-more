// src/components/DestinationHero/DestinationHero.jsx
import styles from './DestinationHero.module.css';

/**
 * Full-bleed banner with a title centred over a photo. Shared by the
 * /destinations index and each island page so the two cannot drift apart.
 *
 * @param {{ title: string, image?: string | null }} props
 */
export default function DestinationHero({ title, image }) {
  return (
    <section
      className={image ? styles.hero : `${styles.hero} ${styles.heroPlain}`}
      style={image ? { backgroundImage: `url(${image})` } : undefined}
    >
      <h1 className={styles.title}>{title}</h1>
    </section>
  );
}
