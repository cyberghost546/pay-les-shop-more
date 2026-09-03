// src/components/NavDropdown/NavDropdown.jsx
import { useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './NavDropdown.module.css';

/**
 * A nav item that opens a panel of links. On desktop the panel floats below
 * the trigger; inside the mobile sheet it expands inline.
 *
 * @param {{ label: string, items: {key: string, href: string}[],
 *           onNavigate?: () => void }} props
 */
export default function NavDropdown({ label, items, onNavigate }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const { t } = useLanguage();
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    // Escape is the expected way out of any open overlay.
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    // Pointer down rather than click: closes before the click lands, so a tap
    // on something behind the panel does not need a second attempt.
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  function handleLinkClick() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
      // Tabbing out of the last link should close the panel behind you.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={open ? `${styles.trigger} ${styles.triggerOpen}` : styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <ul
        id={panelId}
        className={open ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
      >
        {items.map((item) => (
          <li key={item.href}>
            <NavLink
              to={item.href}
              onClick={handleLinkClick}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              {t(item.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
