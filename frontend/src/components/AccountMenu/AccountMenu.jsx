// src/components/AccountMenu/AccountMenu.jsx
//
// The signed-in person in a dashboard top bar: initials, name and role on a
// button that opens a short menu - the links the dashboard passes in, then
// Sign out. Used by both the office and the warehouse dashboards.

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useDismiss } from '../../hooks/useDismiss';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './AccountMenu.module.css';

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

/**
 * @param {{ links?: { to: string, label: string }[], signOutLabel: string,
 *   onSignOut: () => void }} props
 */
export default function AccountMenu({ links = [], signOutLabel, onSignOut }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapper, open, close);

  const name = user?.name?.trim() || user?.email;
  const role = t(`dashboard.roles.${user?.role ?? 'customer'}`);

  return (
    <div className={styles.account} ref={wrapper}>
      <button
        type="button"
        className={styles.accountButton}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('dashboard.warehouse.account')}: ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          {initialsOf(user)}
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountName}>{name}</span>
          <span className={styles.accountRole}>{role}</span>
        </span>
        <span className={styles.accountChevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.accountMenu}>
          <div className={styles.accountMenuHead}>
            <span className={styles.accountMenuName}>{name}</span>
            <span className={styles.accountMenuEmail}>{user?.email}</span>
            <span className={styles.accountMenuEmail}>{role}</span>
          </div>
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={styles.accountMenuItem} onClick={close}>
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            className={`${styles.accountMenuItem} ${styles.accountMenuSignOut}`}
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            {signOutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
