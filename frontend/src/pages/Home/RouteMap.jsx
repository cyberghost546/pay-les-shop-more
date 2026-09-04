// src/pages/Home/RouteMap.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DESTINATIONS } from '../../data/destinations';
import { useInViewport } from '../../hooks/useInViewport';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Home.module.css';

// The routes the company actually runs, all leaving from the Netherlands.
// Built from the shared island list, so the transit times quoted here and on
// the destination pages can never disagree.
//
// The coordinates are positions in the 900×470 drawing, not real latitude and
// longitude — this is a schematic, and pretending otherwise would put the
// islands in the wrong place by a hundred miles.
const ORIGIN = { x: 470, y: 128, labelKey: 'home.map.origin' };

const ROUTES = DESTINATIONS.map((island) => ({
  slug: island.slug,
  nameKey: island.nameKey,
  x: island.mapX,
  y: island.mapY,
  days: island.transitDays,
}));

/** A gentle arc from origin to destination, bowed away from the straight line. */
function arc(from, to) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  // Perpendicular offset, scaled to the distance, so long routes bow more.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = Math.hypot(dx, dy) * 0.18;
  const controlX = midX + (dy / Math.hypot(dx, dy)) * bow;
  const controlY = midY - (dx / Math.hypot(dx, dy)) * bow;

  return `M${from.x} ${from.y} Q${controlX} ${controlY} ${to.x} ${to.y}`;
}

export default function RouteMap() {
  const { t } = useLanguage();
  const [ref, seen] = useInViewport();
  const [active, setActive] = useState(null);

  const shown = ROUTES.find((route) => route.slug === active);

  return (
    <section
      className={seen ? `${styles.section} ${styles.revealed}` : styles.section}
      ref={ref}
    >
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>{t('home.map.eyebrow')}</p>
        <h2 className={styles.sectionTitle}>{t('home.map.title')}</h2>
        <p className={styles.sectionLead}>{t('home.map.lead')}</p>
      </div>

      <div className={styles.mapWrap}>
        <svg viewBox="0 0 900 470" className={styles.map} role="img"
             aria-label={t('home.map.title')}>
          <defs>
            <radialGradient id="mapGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="900" height="470" fill="#0b2545" />
          <ellipse cx="380" cy="240" rx="360" ry="220" fill="url(#mapGlow)" />

          {/* A dot grid standing in for the ocean. Cheap, and it reads as a
              map without claiming any particular coastline. */}
          <g className={styles.mapDots}>
            {Array.from({ length: 22 }, (_, row) =>
              Array.from({ length: 42 }, (_, column) => (
                <circle
                  key={`${row}-${column}`}
                  cx={20 + column * 21}
                  cy={18 + row * 21}
                  r="1.4"
                />
              )),
            )}
          </g>

          {ROUTES.map((route) => {
            const isActive = active === route.slug;
            return (
              <g key={route.slug}>
                <path
                  d={arc(ORIGIN, route)}
                  className={
                    isActive
                      ? `${styles.routeLine} ${styles.routeLineActive}`
                      : styles.routeLine
                  }
                />
                {/* A pulse running the route, only for the hovered one, so
                    five simultaneous animations do not fight for attention. */}
                {isActive && (
                  <circle r="4.5" className={styles.routePulse}>
                    <animateMotion dur="2.4s" repeatCount="indefinite"
                                   path={arc(ORIGIN, route)} />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Origin */}
          <g transform={`translate(${ORIGIN.x} ${ORIGIN.y})`}>
            <circle r="18" className={styles.mapHalo} />
            <circle r="7" className={styles.mapOrigin} />
            <text y="-28" textAnchor="middle" className={styles.mapLabel}>
              {t(ORIGIN.labelKey)}
            </text>
          </g>

          {/* Destinations. Each is a button so it works by keyboard as well as
              by pointer — a hover-only map is unusable without a mouse. */}
          {ROUTES.map((route) => (
            <g
              key={route.slug}
              transform={`translate(${route.x} ${route.y})`}
              className={styles.mapPin}
              tabIndex={0}
              role="button"
              aria-label={t(route.nameKey)}
              onMouseEnter={() => setActive(route.slug)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(route.slug)}
              onBlur={() => setActive(null)}
            >
              <circle r="16" className={styles.mapHitArea} />
              <circle
                r={active === route.slug ? 8 : 6}
                className={styles.mapDestination}
              />
              <text y="-20" textAnchor="middle" className={styles.mapLabel}>
                {t(route.nameKey)}
              </text>
            </g>
          ))}
        </svg>

        {/* The information panel. Always in the DOM with a resting state, so
            the layout does not jump when a route is hovered. */}
        <div className={styles.mapPanel}>
          {shown ? (
            <>
              <p className={styles.mapPanelRoute}>
                {t(ORIGIN.labelKey)} <span aria-hidden="true">→</span>{' '}
                {t(shown.nameKey)}
              </p>
              <dl className={styles.mapPanelFacts}>
                <div>
                  <dt>{t('home.map.transit')}</dt>
                  <dd>{t('home.map.days').replace('{days}', shown.days)}</dd>
                </div>
                <div>
                  <dt>{t('home.map.mode')}</dt>
                  <dd>{t('home.map.sea')}</dd>
                </div>
              </dl>
              <Link className={styles.mapPanelLink} to={`/destinations/${shown.slug}`}>
                {t('home.map.more')} →
              </Link>
            </>
          ) : (
            <p className={styles.mapPanelHint}>{t('home.map.hint')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
