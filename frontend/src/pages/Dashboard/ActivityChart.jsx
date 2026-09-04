// src/pages/Dashboard/ActivityChart.jsx
//
// The line chart above the overview. Inline SVG rather than a charting
// library: this is three polylines over a shared scale, and the project has a
// standing habit of not taking a dependency for something this size — the
// settings module even parses its own .env.
//
// Drawn in a fixed 1000×280 user-space box and scaled to the container by
// preserveAspectRatio="none" on the viewBox. That keeps the maths simple and
// the chart responsive, at the cost of the stroke width stretching slightly
// on very wide screens — which is why vector-effect below pins it.

import { useId, useState } from 'react';
import styles from './Dashboard.module.css';

const WIDTH = 1000;
const HEIGHT = 280;
// Room for the axis labels: dates below, counts to the left.
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// Order matters: packages is the headline number, so it is drawn last and
// sits on top where the lines cross.
const SERIES = [
  { key: 'messages', label: 'Messages', colour: '#94a3b8' },
  { key: 'quotes', label: 'Quote requests', colour: '#f59e0b' },
  { key: 'packages', label: 'Packages', colour: '#2563eb' },
];

/** A "nice" upper bound, so the gridline labels are round numbers. */
function niceCeiling(value) {
  if (value <= 4) return 4;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  // 1, 2, 5, 10, 20, 50, … — the steps people read without thinking.
  const step = [1, 2, 5, 10].find((n) => value <= n * magnitude) ?? 10;
  return step * magnitude;
}

function formatDay(iso) {
  // Parsed as UTC, which is what the server counted in — reading it as local
  // time would shift a day either side of midnight.
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * @param {{ daily: {date: string, quotes: number, packages: number,
 *   messages: number}[] }} props
 */
export default function ActivityChart({ daily }) {
  const titleId = useId();
  // Which day the pointer is over, or null. Index rather than the row itself,
  // so the guide line can be positioned without searching for it again.
  const [hover, setHover] = useState(null);

  if (!daily || daily.length === 0) return null;

  const peak = Math.max(
    1,
    ...daily.flatMap((row) => SERIES.map(({ key }) => row[key])),
  );
  const ceiling = niceCeiling(peak);

  // A single point would make the step divide by zero, so it is pinned to the
  // left edge instead.
  const step = daily.length > 1 ? PLOT_WIDTH / (daily.length - 1) : 0;

  const x = (index) => PADDING.left + index * step;
  const y = (value) => PADDING.top + PLOT_HEIGHT * (1 - value / ceiling);

  // Five gridlines including both ends, at round fractions of the ceiling.
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    value: Math.round(ceiling * fraction),
    y: y(ceiling * fraction),
  }));

  // Enough labels to orient the reader, never so many they collide. One every
  // nth day, where n grows with the range.
  const labelEvery = Math.max(1, Math.ceil(daily.length / 7));

  const total = (key) => daily.reduce((sum, row) => sum + row[key], 0);

  return (
    <figure className={styles.chartFigure}>
      <figcaption className={styles.legend}>
        {SERIES.map(({ key, label, colour }) => (
          <span key={key} className={styles.legendItem}>
            <span
              className={styles.legendSwatch}
              style={{ background: colour }}
              aria-hidden="true"
            />
            {label}
            <b className={styles.legendTotal}>{total(key)}</b>
          </span>
        ))}
      </figcaption>

      <div className={styles.chartBox}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={titleId}
          onPointerLeave={() => setHover(null)}
        >
          <title id={titleId}>
            {`Daily activity over ${daily.length} days. ` +
              SERIES.map(({ key, label }) => `${label}: ${total(key)}`).join(', ')}
          </title>

          {gridlines.map(({ value, y: lineY }) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={lineY}
                y2={lineY}
                className={styles.gridline}
              />
              <text
                x={PADDING.left - 8}
                y={lineY + 4}
                textAnchor="end"
                className={styles.axisLabel}
              >
                {value}
              </text>
            </g>
          ))}

          {daily.map((row, index) =>
            index % labelEvery === 0 ? (
              <text
                key={row.date}
                x={x(index)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className={styles.axisLabel}
              >
                {formatDay(row.date)}
              </text>
            ) : null,
          )}

          {/* The guide line for whichever day is under the pointer */}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              className={styles.guideline}
            />
          )}

          {SERIES.map(({ key, colour }) => (
            <polyline
              key={key}
              points={daily.map((row, index) => `${x(index)},${y(row[key])}`).join(' ')}
              fill="none"
              stroke={colour}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              // Without this the non-uniform viewBox scaling would stretch
              // the stroke horizontally and the line would look thicker on a
              // wide screen than a narrow one.
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Dots only for the hovered day: one per day at 90 days is noise */}
          {hover !== null &&
            SERIES.map(({ key, colour }) => (
              <circle
                key={key}
                cx={x(hover)}
                cy={y(daily[hover][key])}
                r="4"
                fill={colour}
                stroke="#ffffff"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {/* Invisible hit areas, one per day, so the whole column responds
              rather than only the 2px line itself. */}
          {daily.map((row, index) => (
            <rect
              key={row.date}
              x={x(index) - step / 2}
              y={PADDING.top}
              width={Math.max(step, 1)}
              height={PLOT_HEIGHT}
              fill="transparent"
              onPointerEnter={() => setHover(index)}
            />
          ))}
        </svg>

        {/* Read-out rather than a floating tooltip: a tooltip positioned over
            a non-uniformly scaled SVG fights the scaling, and this stays put
            where the eye already is. */}
        <p className={styles.readout} aria-live="off">
          {hover === null ? (
            <span className={styles.readoutHint}>
              Point at the chart to read a day
            </span>
          ) : (
            <>
              <b>{formatDay(daily[hover].date)}</b>
              {SERIES.map(({ key, label, colour }) => (
                <span key={key} className={styles.readoutItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{ background: colour }}
                    aria-hidden="true"
                  />
                  {label} <b>{daily[hover][key]}</b>
                </span>
              ))}
            </>
          )}
        </p>
      </div>
    </figure>
  );
}
