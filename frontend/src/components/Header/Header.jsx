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
  { key: 'nav.tracking', href: '/tracking' },
  { key: 'nav.booking', href: '/booking' },
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

// How far down the page before the bar condenses.
const CONDENSE_AFTER = 24;

/** "Christopher Molina" becomes "CM". */
function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
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

  // The bar gives back some height once the visitor starts reading, and picks
  // up a shadow so it separates from whatever scrolls under it.
  useEffect(() => {
    function handleScroll() {
      setCondensed(window.scrollY > CONDENSE_AFTER);
    }

    handleScroll();
    // passive: this never calls preventDefault, and saying so keeps it off
    // the browser's critical path for scrolling.
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const name = user?.name?.trim() || '';

  return (
    // .header spans the full width so its background/border reach both edges.
    <header
      className={condensed ? `${styles.header} ${styles.condensed}` : styles.header}
    >
      <div className={styles.inner}>
        <Link to="/" className={styles.logo} onClick={close}>
          PayLesShopMore<span className={styles.logoDot}>.com</span>
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

          {/* A hairline between "where can I go" and "who am I". Without it
              the account links read as four more nav items. */}
          <span className={styles.divider} aria-hidden="true" />

          <div className={styles.account}>
            {isAuthenticated ? (
              <>
                {/* Staff only, and only a shortcut — the dashboard's own
                    guard and the API both check the flag again. Untranslated
                    on purpose: the back office is English throughout. */}
                {user?.isStaff && (
                  <Link to="/dashboard" className={styles.dashboard} onClick={close}>
                    <svg
                      className={styles.dashboardIcon}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
                      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
                      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
                      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
                    </svg>
                    Dashboard
                  </Link>
                )}

                {/* The account itself: initials and a name, which reads as a
                    person rather than as another destination in the nav. */}
                <Link to="/profile" className={styles.identity} onClick={close}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initialsOf(name || user?.email || '?')}
                  </span>
                  <span className={styles.identityName}>
                    {name || t('account.profile')}
                  </span>
                </Link>

                {/* Quiet: ending a session is the least important thing on
                    this bar, and the filled style belongs to whatever the
                    main action is. When signed in there is not one. */}
                <button type="button" className={styles.quiet} onClick={handleSignOut}>
                  {t('account.logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={styles.quiet} onClick={close}>
                  {t('account.login')}
                </Link>
                <Link to="/signup" className={styles.primary} onClick={close}>
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
