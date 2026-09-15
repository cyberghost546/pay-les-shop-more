// src/pages/Dashboard/DashboardLayout.jsx
//
// The office dashboard's shell: a dark navy sidebar holding the brand, the
// sections and the signed-in account, and a light top bar with search. The
// page itself sits on a pale ground to the right.
//
// On tablets and phones the sidebar slides in over the page from a menu
// button in the top bar.

import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getOverview } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import LanguageMenu from '../../components/LanguageSwitcher/LanguageMenu';
import { useLanguage } from '../../i18n/useLanguage';
import { CountPill } from './ui';
import { useSidebarWidth } from './useSidebarWidth';
import {
  BookmarkIcon,
  BoxIcon,
  FileIcon,
  HouseIcon,
  MailIcon,
  ReceiptIcon,
  SearchIcon,
  UsersIcon,
} from './icons';
import styles from './Dashboard.module.css';

// Grouped by the job somebody opens the dashboard to do.
const GROUPS = [
  {
    heading: null,
    links: [{ to: '/dashboard', labelKey: 'dashboard.office.nav.overview', icon: HouseIcon, end: true }],
  },
  {
    heading: 'dashboard.office.groups.sales',
    links: [
      { to: '/dashboard/quotes', labelKey: 'dashboard.office.nav.quotes', icon: FileIcon, pill: (o) => o?.quotes.new },
      { to: '/dashboard/bookings', labelKey: 'dashboard.office.nav.bookings', icon: BookmarkIcon, pill: (o) => o?.bookings?.new },
      { to: '/dashboard/messages', labelKey: 'dashboard.office.nav.messages', icon: MailIcon, pill: (o) => o?.messages.unhandled },
    ],
  },
  {
    heading: 'dashboard.office.groups.shipments',
    links: [
      { to: '/dashboard/packages', labelKey: 'dashboard.office.nav.packages', icon: BoxIcon, pill: (o) => o?.packages.awaiting_action },
      { to: '/dashboard/measurements', labelKey: 'dashboard.office.nav.measurements', icon: BoxIcon },
    ],
  },
  {
    heading: 'dashboard.office.groups.billing',
    links: [
      {
        to: '/dashboard/invoices',
        labelKey: 'dashboard.office.nav.invoices',
        icon: ReceiptIcon,
        pill: (o) => o?.invoices?.pending_review,
      },
      {
        to: '/dashboard/documents',
        labelKey: 'dashboard.office.nav.documents',
        icon: FileIcon,
        pill: (o) => o?.documents?.unattached,
      },
    ],
  },
  {
    heading: 'dashboard.office.groups.people',
    links: [{ to: '/dashboard/customers', labelKey: 'dashboard.office.nav.customers', icon: UsersIcon }],
  },
  {
    heading: 'dashboard.office.groups.warehouse',
    // The warehouse has its own dashboard and shell; these leave this one.
    links: [
      { to: '/warehouse', labelKey: 'dashboard.office.nav.warehouseDashboard', icon: HouseIcon, end: true },
      { to: '/warehouse/scan', labelKey: 'dashboard.office.nav.scan', icon: BoxIcon },
      { to: '/warehouse/intake', labelKey: 'dashboard.office.nav.intake', icon: FileIcon },
    ],
  },
];

// Which list a search from the top bar lands in. On any other page, packages:
// the biggest table, and the one a tracking number belongs to.
const SEARCHABLE = [
  '/dashboard/quotes',
  '/dashboard/messages',
  '/dashboard/packages',
  '/dashboard/customers',
  '/dashboard/bookings',
  '/dashboard/measurements',
];
const DEFAULT_SEARCH_TARGET = '/dashboard/packages';

function initialsOf(user) {
  const source = user?.name?.trim() || user?.email || '?';
  return (
    source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

function NavItem({ link, overview, onNavigate }) {
  const { t } = useLanguage();
  const { to, labelKey, icon: Icon, end, pill } = link;

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink)}
    >
      <Icon />
      <span className={styles.navLabel}>{t(labelKey)}</span>
      <CountPill value={pill?.(overview)} />
    </NavLink>
  );
}

/**
 * The overview request lives here rather than on the Overview page because
 * the sidebar's count pills need the same numbers. It is re-fetched on each
 * page change, which keeps a pill honest after somebody handles a message.
 */
export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(30);
  const [navOpen, setNavOpen] = useState(false);
  const { width: sidebarWidth, resizing, handleProps } = useSidebarWidth();

  const key = `${pathname}#${days}#${attempt}`;
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    getOverview(days)
      .then((data) => {
        if (!cancelled) setAnswer({ key, status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
    // `key` already encodes the path, the range and the retry counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const state = answer.key === key ? answer.status : 'loading';
  // The previous numbers are kept while a refetch is in flight, so the pills
  // hold steady instead of blinking out on every page change.
  const overview = answer.data;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const closeNav = () => setNavOpen(false);

  function handleSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;

    const target = SEARCHABLE.includes(pathname) ? pathname : DEFAULT_SEARCH_TARGET;
    navigate(`${target}?search=${encodeURIComponent(term)}`);
    closeNav();
  }

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div
      className={resizing ? `${styles.app} ${styles.resizing}` : styles.app}
      // Only the chosen width is set inline; the stylesheet derives
      // --sidebar-width from it so a media query can still collapse it.
      style={{ '--sidebar-user-width': `${sidebarWidth}px` }}
    >
      <nav
        id="dashboard-nav"
        className={navOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
        aria-label={t('dashboard.office.sectionsLabel')}
      >
        <Link to="/dashboard" className={styles.brand} onClick={closeNav}>
          <span className={styles.brandMark} aria-hidden="true">
            P
          </span>
          <span className={styles.brandText}>
            PayLesShopMore<span className={styles.brandDot}>.com</span>
            <span className={styles.brandSub}>{t('dashboard.office.brandSub')}</span>
          </span>
        </Link>

        <div className={styles.navScroll}>
          {GROUPS.map((group) => (
            <div key={group.heading ?? 'top'} className={styles.navGroup}>
              {group.heading && <p className={styles.navHeading}>{t(group.heading)}</p>}
              <ul className={styles.navList}>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavItem link={link} overview={overview} onNavigate={closeNav} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.navFoot}>
          <div className={styles.account}>
            <span className={styles.avatar} aria-hidden="true">
              {initialsOf(user)}
            </span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{user?.name?.trim() || user?.email}</span>
              <span className={styles.accountRole}>{t(`dashboard.roles.${user?.role ?? 'customer'}`)}</span>
            </span>
          </div>
          <div className={styles.navFootLinks}>
            <a className={styles.navFootLink} href="/admin/" target="_blank" rel="noreferrer">
              {t('dashboard.office.djangoAdmin')}
            </a>
            <Link className={styles.navFootLink} to="/" onClick={closeNav}>
              {t('dashboard.office.backToSite')}
            </Link>
            {/* The top bar hides Sign out on phones; this is where it is then. */}
            <button type="button" className={`${styles.navFootLink} ${styles.navFootButton}`} onClick={handleSignOut}>
              {t('dashboard.office.signOut')}
            </button>
          </div>
        </div>
      </nav>

      {/* The divider between sidebar and page; drag to resize. Hidden on
          narrow screens, where the sidebar is an overlay. */}
      <div className={styles.resizer} {...handleProps} />

      {navOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label={t('dashboard.office.closeMenu')}
          tabIndex={-1}
          onClick={closeNav}
        />
      )}

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.navToggle}
            aria-expanded={navOpen}
            aria-controls="dashboard-nav"
            aria-label={t(navOpen ? 'dashboard.office.closeMenu' : 'dashboard.office.openMenu')}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className={styles.navToggleBars} aria-hidden="true" />
          </button>

          <Link to="/dashboard" className={styles.topBrand}>
            PayLesShopMore
          </Link>

          <form className={styles.searchForm} onSubmit={handleSearch} role="search">
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              type="search"
              className={styles.topSearch}
              placeholder={t('dashboard.office.searchPlaceholder')}
              aria-label={t('dashboard.office.searchLabel')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>

          <LanguageMenu />

          <div className={styles.topRight}>
            <Link to="/warehouse" className={styles.topLink}>
              {t('dashboard.office.warehouse')}
            </Link>
            <button type="button" className={styles.signOut} onClick={handleSignOut}>
              {t('dashboard.office.signOut')}
            </button>
          </div>
        </header>

        <main className={styles.main}>
          <Outlet context={{ overview, state, reload, days, setDays }} />
        </main>
      </div>
    </div>
  );
}
