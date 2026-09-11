// src/pages/Dashboard/DashboardLayout.jsx
import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { getOverview } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
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

// The navigation, in labelled groups. One flat list of seven links reads as
// seven equally important things; grouped, it reads as "the work", "the
// money", "the people", which is how somebody actually decides where to go.
//
// Dashboard sits above the groups with no heading of its own — it is the way
// back, not a category.
const SECTIONS = [
  { to: '/dashboard', label: 'Dashboard', icon: HouseIcon, end: true },
];

const GROUPS = [
  {
    heading: 'Operations',
    links: [
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
        to: '/dashboard/bookings',
        label: 'Bookings',
        icon: FileIcon,
        pill: (o) => o?.bookings?.new,
      },
    ],
  },
  {
    heading: 'Shipments',
    links: [
      {
        to: '/dashboard/packages',
        label: 'Packages',
        icon: BoxIcon,
        pill: (o) => o?.packages.awaiting_action,
      },
    ],
  },
  {
    heading: 'Warehouse',
    // The floor's whole dashboard, and the only group a warehouse account
    // sees. Kept as one group rather than scattered through the others so
    // that hiding the rest is a filter on this list and not an exception
    // written into six places.
    warehouse: true,
    links: [
      { to: '/dashboard/scan', label: 'Scan a package', icon: BoxIcon },
      {
        to: '/dashboard/intake',
        label: 'Intake sheets',
        icon: BoxIcon,
        // No pill. The number that would belong here is "drafts open in the
        // warehouse", and a draft is somebody's work in progress rather than
        // a queue anybody else should be nagged about - the badge would sit
        // at three all day and mean nothing.
      },
    ],
  },
  {
    heading: 'Billing',
    links: [
      {
        to: '/dashboard/invoices',
        label: 'Invoices',
        icon: ReceiptIcon,
        // What is waiting for a person. An invoice sits here unseen by the
        // customer until somebody approves it, so an unattended queue is a
        // customer with no invoice.
        pill: (o) => o?.invoices?.pending_review,
      },
    ],
  },
  {
    heading: 'Paperwork',
    links: [
      {
        to: '/dashboard/documents',
        label: 'Documents',
        icon: ReceiptIcon,
        // What customers have sent in that nobody has filed against a
        // shipment yet. The only number here that is work.
        pill: (o) => o?.documents?.unattached,
      },
    ],
  },
  {
    heading: 'People',
    links: [{ to: '/dashboard/customers', label: 'Customers', icon: UsersIcon }],
  },
];

// The standing questions someone opens this dashboard to answer. Each is just
// a section with a filter already applied — the work is in choosing which few
// are worth a permanent place, not in the mechanism.
const QUICK_VIEWS = [
  { to: '/dashboard/quotes?status=new', label: 'New quote requests' },
  { to: '/dashboard/messages?handled=false', label: 'Unhandled messages' },
  { to: '/dashboard/packages?status=in_transit', label: 'In transit' },
  // The one a warehouse account keeps, because it is the only one pointing
  // at a page they can open.
  {
    to: '/dashboard/intake?status=draft',
    label: 'Unreleased intake sheets',
    warehouse: true,
  },
  { to: '/dashboard/invoices', label: 'Invoices to review' },
  { to: '/dashboard/documents?unattached=true', label: 'Unfiled documents' },
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
  '/dashboard/intake',
];
const DEFAULT_SEARCH_TARGET = '/dashboard/packages';

// Where a warehouse account lands, and where its searches go. Packages is an
// office page, so neither default above can stand for somebody who cannot
// open it.
const WAREHOUSE_HOME = '/dashboard/scan';
const WAREHOUSE_SEARCH_TARGET = '/dashboard/intake';

/** One sidebar link: icon, label, and the count pill when it has one. */
function NavItem({ link, overview, onNavigate }) {
  const { to, label, icon: Icon, end, pill } = link;

  return (
    <NavLink
      to={to}
      // Without `end`, /dashboard would stay highlighted on every child
      // route, since they all start with it.
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
      }
    >
      <Icon />
      <span className={styles.navLabel}>{label}</span>
      <CountPill value={pill?.(overview)} />
    </NavLink>
  );
}

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

  // Which dashboard this is. An account can hold both roles, and the office
  // one wins: it is the larger, and it includes the warehouse pages anyway.
  //
  // Presentation only. Every route behind these links is checked on the
  // server, and a warehouse account that edits its own JavaScript to draw the
  // invoice link still gets a 403 when it presses it.
  const isOffice = Boolean(user?.isStaff);
  const floorOnly = !isOffice && Boolean(user?.isWarehouse);

  const sections = floorOnly ? [] : SECTIONS;
  const groups = floorOnly ? GROUPS.filter((group) => group.warehouse) : GROUPS;
  const quickViews = floorOnly
    ? QUICK_VIEWS.filter((view) => view.warehouse)
    : QUICK_VIEWS;

  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  // How far back the overview's chart reaches. Owned here because the request
  // that answers it is: one round trip feeds both the chart and the badges.
  const [days, setDays] = useState(30);
  // Closed on phones until the menu button is pressed; irrelevant on a wide
  // screen, where the sidebar is always visible.
  const [navOpen, setNavOpen] = useState(false);
  // How wide the navigation column is, dragged by the divider on its right
  // edge and remembered between visits.
  const { width: sidebarWidth, resizing, handleProps } = useSidebarWidth();

  // Which request this is, so the render below can tell a fresh answer from a
  // stale one without the effect having to set a loading flag itself.
  const key = `${pathname}#${days}#${attempt}#${isOffice}`;
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    // Not asked for at all on the floor. The overview is office-only on the
    // server, so a warehouse account would refetch a 403 on every page change
    // - and each one would send the auth context off to re-read the profile
    // to find out whether the session had ended. It had not; the question was
    // simply not theirs to ask.
    //
    // The answer for that case is derived below rather than stored, which is
    // what keeps this effect free of a setState it would run on every render.
    if (!isOffice) return undefined;

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

  // 'ready' with nothing in it on the floor: there are no badges to fill and
  // no chart to draw, so a page waiting on numbers that will never come would
  // be a spinner that never stops.
  const state = isOffice ? (answer.key === key ? answer.status : 'loading') : 'ready';
  // The previous numbers are kept while a refetch is in flight, so the
  // sidebar badges hold steady instead of blinking out on every page change.
  const overview = isOffice ? answer.data : null;

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Navigating anywhere closes the mobile sheet: leaving it open would cover
  // the page it just moved to.
  const closeNav = () => setNavOpen(false);

  // "Home" for whoever is looking. The overview is office-only, so for the
  // floor the scanner is the front page - it is also the first thing they
  // want, which is the point of the role existing.
  const home = floorOnly ? WAREHOUSE_HOME : '/dashboard';

  function handleSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;

    const fallback = floorOnly ? WAREHOUSE_SEARCH_TARGET : DEFAULT_SEARCH_TARGET;
    const target = SEARCHABLE.includes(pathname) ? pathname : fallback;
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
    <div
      className={resizing ? `${styles.app} ${styles.resizing}` : styles.app}
      // Only the user's chosen width is set here. The stylesheet derives
      // --sidebar-width from it, which lets the narrow-screen media query
      // override that to 0 — an inline --sidebar-width would outrank the
      // media query and leave a phone with a 240px margin and no sidebar.
      style={{ '--sidebar-user-width': `${sidebarWidth}px` }}
    >
      <header className={styles.topbar}>
        <Link to={home} className={styles.brand} onClick={closeNav}>
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
            {sections.map((link) => (
              <li key={link.to}>
                <NavItem link={link} overview={overview} onNavigate={closeNav} />
              </li>
            ))}
          </ul>

          {groups.map((group) => (
            <div key={group.heading}>
              <p className={styles.navHeading}>{group.heading}</p>
              <ul className={styles.navList}>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavItem link={link} overview={overview} onNavigate={closeNav} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className={styles.navHeading}>Quick views</p>
          <ul className={styles.navList}>
            {quickViews.map(({ to, label }) => (
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
                creating a package — still lives in Django's own admin. Not
                offered to the floor, whose accounts are deliberately not
                `is_staff` and would only be bounced by its login. */}
            {isOffice && (
              <a
                className={styles.navFootLink}
                href="/admin/"
                target="_blank"
                rel="noreferrer"
              >
                Django admin ↗
              </a>
            )}
            <Link className={styles.navFootLink} to="/" onClick={closeNav}>
              Back to the site
            </Link>
          </div>
        </nav>

        {/* The divider between the sidebar and the page. A sibling of the
            sidebar rather than a child of it: the sidebar scrolls its own
            contents, and a handle inside would scroll away with them.
            Hidden on narrow screens, where the sidebar is an overlay and
            has no edge to drag. */}
        <div className={styles.resizer} {...handleProps} />

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
          {/* /dashboard itself is the overview, which is office-only. Sending
              the floor on to the scanner is better than letting them land on
              a page that can only answer 403. */}
          {floorOnly && pathname === '/dashboard' ? (
            <Navigate to={WAREHOUSE_HOME} replace />
          ) : (
            <Outlet context={{ overview, state, reload, days, setDays }} />
          )}
        </main>
      </div>
    </div>
  );
}
