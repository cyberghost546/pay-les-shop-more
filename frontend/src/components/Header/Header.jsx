import { Link } from 'react-router-dom';
import styles from './Header.module.css';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Services', href: '/services' },
  { label: 'Calculator', href: '/calculator' },
  { label: 'Contact', href: '/contact' },
];

export default function Header() {
  return (
    // .header spans the full width so its background/border reach both edges.
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="/" className={styles.logo}>
          PayLesShopMore.com
        </a>
        <nav className={styles.nav} aria-label="Main navigation">
          <ul className={styles.navList}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={styles.navLink}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Account actions: quiet "Log in", solid "Sign up" as the primary call. */}
        <div className={styles.account}>
          <Link to="/login" className={styles.login}>
            Log in
          </Link>
          <Link to="/signup" className={styles.signup}>
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
