// src/pages/Warehouse/WarehouseLayout.jsx
//
// The warehouse dashboard's shell. Separate from the office's DashboardLayout
// at the UI level: different navigation, no office sections, and a guard
// (RequireWarehouse) that only lets warehouse and office accounts in. The
// server checks the same thing on every request.
//
// Wide screens (tablets in landscape, warehouse PCs) get a sidebar of large
// targets. Phones and portrait tablets get a bottom bar with the four most
// used sections and a "More" sheet for the rest.

import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import dashboard from '../Dashboard/Dashboard.module.css';
import {
  AlertIcon,
  ClockIcon,
  HomeIcon,
  MenuIcon,
  PackageIcon,
  RulerIcon,
  ScanIcon,
  SheetIcon,
  TapeIcon,
  UserIcon,
} from './icons';
import styles from './Warehouse.module.css';

const NAV = [
  { to: '/warehouse', label: 'Dashboard', icon: HomeIcon, end: true, primary: true },
  { to: '/warehouse/scan', label: 'Scan Package', short: 'Scan', icon: ScanIcon, primary: true },
  { to: '/warehouse/packages', label: 'Packages', icon: PackageIcon, primary: true },
  { to: '/warehouse/measurements', label: 'Measurements', icon: RulerIcon },
  { to: '/warehouse/packaging', label: 'Packaging', icon: TapeIcon },
  { to: '/warehouse/damage', label: 'Damaged Packages', short: 'Damage', icon: AlertIcon },
  { to: '/warehouse/activity', label: 'Activity', icon: ClockIcon },
  { to: '/warehouse/profile', label: 'Profile', icon: UserIcon },
];

// Still reachable: handover e-mails link to intake sheets.
const SECONDARY = [{ to: '/warehouse/intake', label: 'Intake sheets', icon: SheetIcon }];

function navClass({ isActive }) {
  return isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem;
}

function NavList({ items, onPick }) {
  return items.map(({ to, label, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} className={navClass} onClick={onPick}>
      <Icon />
      <span>{label}</span>
    </NavLink>
  ));
}

export default function WarehouseLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  // Closed by its own links (onPick) and by the backdrop.
  const [moreOpen, setMoreOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className={`${dashboard.app} ${styles.shell}`}>
      <header className={styles.topbar}>
        <Link to="/warehouse" className={styles.brand}>
          PayLesShopMore<span className={styles.brandDot}>.com</span>
          <span className={styles.brandTag}>Warehouse</span>
        </Link>

        <div className={styles.topRight}>
          <Link to="/warehouse/profile" className={styles.who}>
            {user?.name?.trim() || user?.email}
          </Link>
          {/* Office accounts can switch; warehouse workers have no office. */}
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

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Warehouse sections">
          <NavList items={NAV} />
          <div className={styles.navDivider} />
          <NavList items={SECONDARY} />
        </nav>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <nav className={styles.bottomTabs} aria-label="Warehouse sections">
        {NAV.filter((item) => item.primary).map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            <Icon />
            <span>{short ?? label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`${styles.navItem} ${moreOpen ? styles.navItemActive : ''}`}
          aria-expanded={moreOpen}
          aria-controls="warehouse-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MenuIcon />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            className={styles.moreBackdrop}
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <nav id="warehouse-more" className={styles.moreSheet} aria-label="More warehouse sections">
            <NavList
              items={[...NAV.filter((item) => !item.primary), ...SECONDARY]}
              onPick={() => setMoreOpen(false)}
            />
          </nav>
        </>
      )}
    </div>
  );
}
