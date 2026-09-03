import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import NavDropdown from '../NavDropdown/NavDropdown';
import { DESTINATIONS } from '../../data/destinations';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Header.module.css';

// `key` points at the translation; the label itself comes from the dictionary.
// The Destinations dropdown is rendered separately, between Services and
// Calculator, so it is not in this list.
const NAV_LINKS = [
  { key: 'nav.home', href: '/' },
  { key: 'nav.services', href: '/services' },
  { key: 'nav.calculator', href: '/calculator' },
  { key: 'nav.contact', href: '/contact' },
];

// Built from the shared island list, so adding an island in one place updates
// the menu, the index page and the routes together.
const DESTINATION_LINKS = [
  ...DESTINATIONS.map((item) => ({
    key: item.nameKey,
    href: `/destinations/${item.slug}`,
  })),
  { key: 'destinations.other', href: '/destinations' },
];

const MENU_ID = 'primary-navigation';

export default function Header() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const { isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  // Every link closes the menu: navigating with it open would leave the sheet
  // covering the page it just moved to.
  const close = () => setOpen(false);

  async function handleSignOut() {
    close();
    await signOut();
    // Off any page that needs an account, so the guard does not bounce them
    // to the login form immediately afterwards.
    navigate('/', { replace: true });
  }

  // Escape closes the menu, the usual way out of an overlay.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    // .header spans the full width so its background/border reach both edges.
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          PayLesShopMore.com
        </Link>

        {/* Hamburger: hidden on wide screens, where the nav shows in full */}
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={MENU_ID}
          aria-label={open ? t('menu.close') : t('menu.open')}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={styles.menuIcon} aria-hidden="true">
            <span className={open ? styles.barTop : undefined} />
            <span className={open ? styles.barMiddle : undefined} />
            <span className={open ? styles.barBottom : undefined} />
          </span>
        </button>

        {/* One panel holds nav and account actions: a row on desktop, a
            drop-down sheet under the bar on phones and tablets. */}
        <div
          id={MENU_ID}
          className={open ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
        >
          <nav className={styles.nav} aria-label={t('nav.label')}>
            <ul className={styles.navList}>
              {NAV_LINKS.map((link) => (
                <Fragment key={link.href}>
                  <li>
                    <NavLink
                      to={link.href}
                      end={link.href === '/'}
                      onClick={close}
                      className={({ isActive }) =>
                        isActive
                          ? `${styles.navLink} ${styles.navLinkActive}`
                          : styles.navLink
                      }
                    >
                      {t(link.key)}
                    </NavLink>
                  </li>

                  {/* Destinations sits directly after Services */}
                  {link.key === 'nav.services' && (
                    <li>
                      <NavDropdown
                        label={t('destinations.label')}
                        items={DESTINATION_LINKS}
                        onNavigate={close}
                      />
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          </nav>

          {/* Signed in: a link to the account and a way out. Signed out:
              quiet "Log in", solid "Sign up" as the primary call. */}
          <div className={styles.account}>
            {isAuthenticated ? (
              <>
                <Link to="/profile" className={styles.login} onClick={close}>
                  {user?.name?.trim() || t('account.profile')}
                </Link>
                <button
                  type="button"
                  className={styles.signup}
                  onClick={handleSignOut}
                >
                  {t('account.logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={styles.login} onClick={close}>
                  {t('account.login')}
                </Link>
                <Link to="/signup" className={styles.signup} onClick={close}>
                  {t('account.signup')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tap-anywhere-else backdrop, mobile only */}
      {open && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label={t('menu.close')}
          tabIndex={-1}
          onClick={close}
        />
      )}
    </header>
  );
}
