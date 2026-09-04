// src/components/ShipmentTimeline/ShipmentTimeline.jsx
import styles from './ShipmentTimeline.module.css';

/**
 * The stages of a shipment, with everything before the current one marked
 * done. Used twice: inside a tracking result, and on the homepage as an
 * explainer with no shipment attached.
 *
 * The stages come from the server rather than being listed here, so they stay
 * in step with the Package model's own status choices.
 *
 * @param {{
 *   stages: {value: string, label: string}[],
 *   currentIndex?: number,  // -1 when the shipment is not on the timeline
 *   compact?: boolean,
 *   cancelled?: boolean,
 * }} props
 */
export default function ShipmentTimeline({
  stages,
  currentIndex = -1,
  compact = false,
  cancelled = false,
}) {
  if (!stages?.length) return null;

  return (
    <ol className={compact ? `${styles.list} ${styles.compact}` : styles.list}>
      {stages.map((stage, index) => {
        const done = currentIndex >= 0 && index < currentIndex;
        const active = index === currentIndex;

        return (
          <li
            key={stage.value}
            className={[
              styles.step,
              done && styles.done,
              active && styles.active,
              cancelled && styles.cancelled,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.marker} aria-hidden="true">
              {done ? (
                <svg viewBox="0 0 24 24" className={styles.tick}>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : (
                <span className={styles.dot} />
              )}
            </span>

            <span className={styles.label}>
              {stage.label}
              {/* Spoken, not shown: the visual states are colour and a tick,
                  neither of which a screen reader conveys. */}
              {active && <span className={styles.srOnly}> — current stage</span>}
              {done && <span className={styles.srOnly}> — completed</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
