// src/pages/Warehouse/WarehouseLayout.jsx
//
// The warehouse floor's own dashboard: a slim bar across the top and, on a
// phone, three big tabs along the bottom where a thumb already is.
//
// Separate from DashboardLayout on purpose. The office shell is a sidebar of
// ten sections, a search box and badges fed by an overview the floor is not
// allowed to read; the floor needs three things and a scanner. Keeping them
// apart means neither has to carry "unless this is the other one" through
// every line of it.

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { BoxIcon, FileIcon, HouseIcon, UsersIcon } from '../Dashboard/icons';
import dashboard from '../Dashboard/Dashboard.module.css';
import styles from './Warehouse.module.css';

const TABS = [
  { to: '/warehouse', label: 'Home', icon: HouseIcon, end: true },
  { to: '/warehouse/scan', label: 'Scan', icon: BoxIcon },
  { to: '/warehouse/intake', label: 'Intake sheets', icon: FileIcon },
  { to: '/warehouse/profile', label: 'Me', icon: UsersIcon },
];

function Tabs({ className }) {
  return (
    <nav className={className} aria-label="Warehouse sections">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function WarehouseLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    // The dashboard's .app for its palette and ground, which the reused Scan
    // and Intake pages are styled against; the layout itself is this file's.
    <div className={`${dashboard.app} ${styles.shell}`}>
      <header className={styles.topbar}>
        <Link to="/warehouse" className={styles.brand}>
          PayLesShopMore<span className={styles.brandDot}>.com</span>
          <span className={styles.brandTag}>Warehouse</span>
        </Link>

        <Tabs className={styles.topTabs} />

        <div className={styles.topRight}>
          <Link to="/warehouse/profile" className={styles.who}>
            {user?.name?.trim() || user?.email}
          </Link>
          {/* The office can come and go between the two; the floor has
              nowhere on the other side to go. */}
          {user?.isStaff && (
            <Link to="/dashboard" className={styles.officeLink}>
              Office
            </Link>
          )}
          <button type="button" className={styles.signOut} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <Tabs className={styles.bottomTabs} />
    </div>
  );
}
