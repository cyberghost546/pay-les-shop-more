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
import LanguageMenu from '../../components/LanguageSwitcher/LanguageMenu';
import { useLanguage } from '../../i18n/useLanguage';
import dashboard from '../Dashboard/Dashboard.module.css';
import AccountMenu from '../../components/AccountMenu/AccountMenu';
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
  { to: '/warehouse', labelKey: 'dashboard', icon: HomeIcon, end: true, primary: true },
  { to: '/warehouse/scan', labelKey: 'scan', shortKey: 'scanShort', icon: ScanIcon, primary: true },
  { to: '/warehouse/packages', labelKey: 'packages', icon: PackageIcon, primary: true },
  { to: '/warehouse/measurements', labelKey: 'measurements', icon: RulerIcon },
  { to: '/warehouse/packaging', labelKey: 'packaging', icon: TapeIcon },
  { to: '/warehouse/damage', labelKey: 'damage', shortKey: 'damageShort', icon: AlertIcon },
  { to: '/warehouse/activity', labelKey: 'activity', icon: ClockIcon },
  { to: '/warehouse/profile', labelKey: 'profile', icon: UserIcon },
];

// Still reachable: handover e-mails link to intake sheets.
const SECONDARY = [{ to: '/warehouse/intake', labelKey: 'intake', icon: SheetIcon }];

function navClass({ isActive }) {
  return isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem;
}

function NavList({ items, onPick }) {
  const { t } = useLanguage();
  return items.map(({ to, labelKey, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} className={navClass} onClick={onPick}>
      <Icon />
      <span>{t(`dashboard.warehouse.nav.${labelKey}`)}</span>
    </NavLink>
  ));
}

export default function WarehouseLayout() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
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
          <span className={styles.brandText}>
            <span className={styles.brandName}>
              PayLesShopMore<span className={styles.brandDot}>.com</span>
            </span>
            <span className={styles.brandTag}>{t('dashboard.warehouse.tag')}</span>
          </span>
        </Link>

        <div className={styles.topRight}>
          {/* Office accounts can switch; warehouse workers have no office. */}
          {user?.isStaff && (
            <Link to="/dashboard" className={styles.officeLink}>
              {t('dashboard.warehouse.office')}
            </Link>
          )}
          <LanguageMenu />
          <AccountMenu
            links={[
              { to: '/warehouse/profile', label: t('dashboard.warehouse.nav.profile') },
              ...(user?.isStaff
                ? [{ to: '/dashboard', label: t('dashboard.warehouse.nav.officeDashboard') }]
                : []),
            ]}
            signOutLabel={t('dashboard.warehouse.signOut')}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label={t('dashboard.warehouse.sectionsLabel')}>
          <NavList items={NAV} />
          <div className={styles.navDivider} />
          <NavList items={SECONDARY} />
        </nav>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <nav className={styles.bottomTabs} aria-label={t('dashboard.warehouse.sectionsLabel')}>
        {NAV.filter((item) => item.primary).map(({ to, labelKey, shortKey, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            <Icon />
            <span>{t(`dashboard.warehouse.nav.${shortKey ?? labelKey}`)}</span>
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
          <span>{t('dashboard.warehouse.nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            className={styles.moreBackdrop}
            aria-label={t('dashboard.warehouse.closeMenu')}
            onClick={() => setMoreOpen(false)}
          />
          <nav id="warehouse-more" className={styles.moreSheet} aria-label={t('dashboard.warehouse.moreLabel')}>
            <NavList
              items={[...NAV.filter((item) => !item.primary), ...SECONDARY]}
              onPick={() => setMoreOpen(false)}
            />
            {/* The top bar has no room for these on a phone. */}
            {user?.isStaff && (
              <Link to="/dashboard" className={styles.navItem}>
                <HomeIcon />
                <span>{t('dashboard.warehouse.nav.officeDashboard')}</span>
              </Link>
            )}
            <button
              type="button"
              className={`${styles.navItem} ${styles.moreSignOut}`}
              onClick={handleSignOut}
            >
              <UserIcon />
              <span>{t('dashboard.warehouse.signOut')}</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
