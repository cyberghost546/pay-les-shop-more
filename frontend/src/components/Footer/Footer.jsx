import { NavLink } from 'react-router-dom';
import styles from './Footer.module.css';

const FOOTER_LINKS = [
  {
    heading: 'Navigation',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Services', href: '/services' },
      { label: 'Calculator', href: '/calculator' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About us', href: '/about-us' },
      { label: 'Blog', href: '/blog' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms and conditions', href: '/terms' },
      { label: 'Cookie policy', href: '/cookies' },
    ],
  },
];

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://facebook.com' },
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          {/* Brand block */}
          <div className={styles.brand}>
            <NavLink to="/" className={styles.logo}>
              PayLesShopMore<span className={styles.dot}>.com</span>
            </NavLink>
            <p className={styles.tagline}>
              Shop smarter, save more. Compare prices and find the best deals
              in one place.
            </p>

            <ul className={styles.social} aria-label="Social media">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className={styles.socialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Link columns */}
          <nav className={styles.columns} aria-label="Footer navigation">
            {FOOTER_LINKS.map((col) => (
              <div key={col.heading} className={styles.column}>
                <h3 className={styles.heading}>{col.heading}</h3>
                <ul className={styles.linkList}>
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <NavLink
                        to={link.href}
                        className={({ isActive }) =>
                          isActive
                            ? `${styles.link} ${styles.linkActive}`
                            : styles.link
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar */}
        <div className={styles.bottom}>
          <p className={styles.copyright}>
            &copy; {year} PayLesShopMore.com — All rights reserved.
          </p>
          <p className={styles.madeIn}>Made in the Netherlands 🇳🇱</p>
        </div>
      </div>
    </footer>
  );
}
