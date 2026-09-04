// src/pages/Dashboard/DashboardLayout.jsx
import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { getOverview } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { CountPill } from './ui';
import {
  BookmarkIcon,
  BoxIcon,
  FileIcon,
  HouseIcon,
  MailIcon,
  SearchIcon,
  UsersIcon,
} from './icons';
import styles from './Dashboard.module.css';

const SECTIONS = [
  { to: '/dashboard', label: 'Dashboard', icon: HouseIcon, end: true },
  {
    to: '/dashboard/quotes',
    label: 'Quote requests',
    icon: FileIcon,
    pill: (o) => o?.quotes.new,
  },
  {
    to: '/dashboard/messages',
    label: 'Messages',
    icon: MailIcon,
    pill: (o) => o?.messages.unhandled,
  },
  {
    to: '/dashboard/packages',
    label: 'Packages',
    icon: BoxIcon,
    pill: (o) => o?.packages.awaiting_action,
  },
  {
    to: '/dashboard/bookings',
    label: 'Bookings',
    icon: FileIcon,
    pill: (o) => o?.bookings?.new,
  },
  { to: '/dashboard/customers', label: 'Customers', icon: UsersIcon },
];

// The standing questions someone opens this dashboard to answer. Each is just
// a section with a filter already applied — the work is in choosing which four
// are worth a permanent place, not in the mechanism.
const QUICK_VIEWS = [
  { to: '/dashboard/quotes?status=new', label: 'New quote requests' },
  { to: '/dashboard/messages?handled=false', label: 'Unhandled messages' },
  { to: '/dashboard/packages?status=in_transit', label: 'In transit' },
  { to: '/dashboard/packages?status=quoted', label: 'Awaiting payment' },
];

// Which list a search from the top bar should land in. On the overview there
// is no list to search, so packages stands in — it is the biggest table and
// the one a tracking number belongs to.
const SEARCHABLE = [
  '/dashboard/quotes',
  '/dashboard/messages',
  '/dashboard/packages',
  '/dashboard/customers',
  '/dashboard/bookings',
];
const DEFAULT_SEARCH_TARGET = '/dashboard/packages';

/**
 * The frame every dashboard page sits in: a dark bar across the top, a
 * navigation column on the left, the page on the right.
 *
 * The overview request lives here rather than on the overview page because
 * the sidebar wants the same numbers for its badges. It is re-fetched on each
 * section change, which is also what keeps a badge honest after someone has
 * just marked five messages handled.
 */
export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  // How far back the overview's chart reaches. Owned here because the request
  // that answers it is: one round trip feeds both the chart and the badges.
  const [days, setDays] = useState(30);
  // Closed on phones until the menu button is pressed; irrelevant on a wide
  // screen, where the sidebar is always visible.
  const [navOpen, setNavOpen] = useState(false);

  // Which request this is, so the render below can tell a fresh answer from a
  // stale one without the effect having to set a loading flag itself.
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
    // `key` already encodes the path, the range and the retry counter, so
    // listing `days` again would only re-run the effect for the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const state = answer.key === key ? answer.status : 'loading';
  // The previous numbers are kept while a refetch is in flight, so the
  // sidebar badges hold steady instead of blinking out on every page change.
  const overview = answer.data;

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Navigating anywhere closes the mobile sheet: leaving it open would cover
  // the page it just moved to.
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
    // Out to the public site: every route in here needs a staff session, so
    // staying put would only hit the guard.
    navigate('/', { replace: true });
  }

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <Link to="/dashboard" className={styles.brand} onClick={closeNav}>
          PayLesShopMore<span className={styles.brandDot}>.com</span>
        </Link>

        <button
          type="button"
          className={styles.navToggle}
          aria-expanded={navOpen}
          aria-controls="dashboard-nav"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setNavOpen((open) => !open)}
        >
          <span className={styles.navToggleBars} aria-hidden="true" />
        </button>

        <form className={styles.searchForm} onSubmit={handleSearch} role="search">
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            type="search"
            className={styles.topSearch}
            placeholder="Search"
            aria-label="Search the dashboard"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>

        <div className={styles.topRight}>
          <span className={styles.who}>{user?.name?.trim() || user?.email}</span>
          <button type="button" className={styles.signOut} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <nav
          id="dashboard-nav"
          className={navOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
          aria-label="Dashboard sections"
        >
          <ul className={styles.navList}>
            {SECTIONS.map(({ to, label, icon: Icon, end, pill }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  // Without `end`, /dashboard would stay highlighted on every
                  // child route, since they all start with it.
                  end={end}
                  onClick={closeNav}
                  className={({ isActive }) =>
                    isActive
                      ? `${styles.navLink} ${styles.navLinkActive}`
                      : styles.navLink
                  }
                >
                  <Icon />
                  <span className={styles.navLabel}>{label}</span>
                  <CountPill value={pill?.(overview)} />
                </NavLink>
              </li>
            ))}
          </ul>

          <p className={styles.navHeading}>Quick views</p>
          <ul className={styles.navList}>
            {QUICK_VIEWS.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={closeNav}
                  // NavLink matches on path alone, so every quick view on
                  // the same section would light up together. The query
                  // string is the whole difference between them, so the
                  // active state is decided on the full URL instead.
                  className={
                    to === `${pathname}${search}`
                      ? `${styles.navLink} ${styles.navLinkActive}`
                      : styles.navLink
                  }
                >
                  <BookmarkIcon />
                  <span className={styles.navLabel}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <div className={styles.navFoot}>
            {/* Everything the dashboard does not cover — editing a customer,
                creating a package — still lives in Django's own admin. */}
            <a
              className={styles.navFootLink}
              href="/admin/"
              target="_blank"
              rel="noreferrer"
            >
              Django admin ↗
            </a>
            <Link className={styles.navFootLink} to="/" onClick={closeNav}>
              Back to the site
            </Link>
          </div>
        </nav>

        {/* Tap-anywhere-else backdrop, mobile only */}
        {navOpen && (
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close menu"
            tabIndex={-1}
            onClick={closeNav}
          />
        )}

        <main className={styles.main}>
          <Outlet context={{ overview, state, reload, days, setDays }} />
        </main>
      </div>
    </div>
  );
}
