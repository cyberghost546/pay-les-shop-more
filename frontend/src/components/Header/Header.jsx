import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import AccountMenu from '../AccountMenu/AccountMenu';
import NavDropdown from '../NavDropdown/NavDropdown';
import { DESTINATIONS } from '../../data/destinations';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Header.module.css';

// `key` points at the translation; the label itself comes from the dictionary.
// The Destinations dropdown is rendered separately, between Services and
// Calculator, so it is not in this list.
//
// No Track & Trace: it is a card in the customer's own account, reached from
// there rather than from the site's navigation.
const NAV_LINKS = [
  { key: 'nav.home', href: '/' },
  { key: 'nav.services', href: '/services' },
  { key: 'nav.tutorial', href: '/tutorial' },
  // tour: the data-tour hook the onboarding tour highlights this link by.
  { key: 'nav.booking', href: '/booking', tour: 'booking' },
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

  // The account menu's links. Staff get a shortcut to their dashboard
  // first - only a shortcut: the dashboard's own guard and the API both
  // check the role again. "Dashboard" is not translated on purpose: the back
  // office is English throughout.
  const isStaffish =
    user?.isStaff || user?.isWarehouse || user?.role === 'driver';
  const dashboardPath = user?.isStaff
    ? '/dashboard'
    : user?.isWarehouse
      ? '/warehouse'
      : '/driver';
  // Staff have their own profile page; /profile is a customer's.
  const profilePath =
    user?.isStaff || user?.isWarehouse ? '/warehouse/profile' : '/profile';
  const accountLinks = [
    ...(isStaffish ? [{ to: dashboardPath, label: 'Dashboard' }] : []),
    { to: profilePath, label: t('account.profile') },
  ];

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
        {/* data-tour="..." attributes on this page are the stable hooks the
            onboarding tour (src/components/Tutorial) uses to find and
            highlight elements. Keep them if you restyle the header. */}
        <button
          type="button"
          data-tour="menu"
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
                      data-tour={link.tour}
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
              // One button for the signed-in person (initials, name, role)
              // opening a small menu: Dashboard (staff only), My account,
              // Log out. The same component the dashboards use, so the
              // account looks the same everywhere.
              // data-tour: the onboarding tour highlights it.
              <div className={styles.accountSlot} data-tour="account">
                <AccountMenu
                  inSheet
                  links={accountLinks}
                  signOutLabel={t('account.logout')}
                  onSignOut={handleSignOut}
                  onNavigate={close}
                />
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  data-tour="login"
                  className={styles.quiet}
                  onClick={close}
                >
                  {t('account.login')}
                </Link>
                <Link
                  to="/signup"
                  data-tour="signup"
                  className={styles.primary}
                  onClick={close}
                >
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
