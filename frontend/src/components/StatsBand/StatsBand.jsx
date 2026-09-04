// src/components/StatsBand/StatsBand.jsx
import { useEffect, useState } from 'react';
import { getSiteStats } from '../../api/tracking';
import { prefersReducedMotion, useInViewport } from '../../hooks/useInViewport';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './StatsBand.module.css';

const COUNT_MS = 1100;

/**
 * Counts from `from` up to `value` once `run` turns true.
 *
 * requestAnimationFrame rather than a timer per step: the browser decides the
 * frame rate, so this costs one update per painted frame instead of sixty a
 * second whether or not anything is on screen.
 */
function useCountUp(value, run) {
  const [shown, setShown] = useState(0);

  // Small numbers are not worth animating, and neither is a request from
  // somebody who has asked the browser for less movement. Decided during
  // render and returned directly, rather than set from inside the effect.
  const instant = value <= 3 || prefersReducedMotion();

  useEffect(() => {
    if (!run || instant) return undefined;

    let frame;
    const started = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / COUNT_MS);
      // Ease-out: fast at first, settling on the final number, which reads as
      // a number arriving rather than a slot machine stopping.
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, run, instant]);

  return instant && run ? value : shown;
}

function Stat({ value, label, suffix = '', run, literal }) {
  const counted = useCountUp(value ?? 0, run);

  return (
    <div className={styles.stat}>
      <p className={styles.value}>
        {literal ?? `${counted.toLocaleString('nl-NL')}${suffix}`}
      </p>
      <p className={styles.label}>{label}</p>
    </div>
  );
}

/**
 * The statistics band. Every number is a real count from the database — see
 * backend/accounts/public.py. Nothing here is invented, which is why the
 * figures are modest and the framing is factual rather than boastful.
 */
export default function StatsBand() {
  const { t } = useLanguage();
  const [ref, seen] = useInViewport();

  const [stats, setStats] = useState(null);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    getSiteStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The band is decoration around real numbers; if they cannot be fetched,
  // the honest thing is to show nothing rather than zeroes or placeholders.
  if (state === 'error') return null;

  return (
    <section className={styles.band} ref={ref} aria-label={t('home.stats.title')}>
      <div className={styles.inner}>
        {state === 'loading' ? (
          <p className={styles.loading}>{t('home.stats.loading')}</p>
        ) : (
          <>
            <Stat
              value={stats.packages_delivered}
              label={t('home.stats.delivered')}
              run={seen}
            />
            <Stat
              value={stats.destinations}
              label={t('home.stats.destinations')}
              run={seen}
            />
            <Stat
              value={stats.customers}
              label={t('home.stats.customers')}
              run={seen}
            />
            {/* Not a count: a statement about the service that is true on day
                one and does not need a database behind it. */}
            <Stat literal="24/7" label={t('home.stats.tracking')} run={seen} />
          </>
        )}
      </div>
    </section>
  );
}
