import type { SocialTrendPoint } from "./social-metrics";

/**
 * Geometry and selection logic for the interactive social signal charts.
 *
 * Pure on purpose: everything here is derived from the stored daily series
 * and a timeframe, so the honest-state rules (windows bounded by real data,
 * empty windows reported as empty) are unit-testable without a DOM.
 */

export const SOCIAL_CHART_TIMEFRAMES = [7, 30, 90] as const;

export type SocialChartTimeframe = (typeof SOCIAL_CHART_TIMEFRAMES)[number];

export interface SocialChartPoint {
  date: string;
  value: number;
  /** Horizontal position, 0..100, time-scaled so date gaps stay visible. */
  x: number;
  /** Vertical position, 0..100 with 0 at the top of the plot. */
  y: number;
}

export interface SocialChartTick {
  position: number;
  label: string;
}

export interface SocialChartModel {
  timeframe: SocialChartTimeframe;
  points: SocialChartPoint[];
  /** SVG path for the value line in the 0..100 viewBox, or null when empty. */
  linePath: string | null;
  /** SVG path for the soft area fill down to the baseline, or null. */
  areaPath: string | null;
  xTicks: SocialChartTick[];
  yTicks: SocialChartTick[];
  rangeMin: number | null;
  rangeMax: number | null;
  observedDays: number;
  /** True when the window holds fewer than two observations. */
  empty: boolean;
}

const DAY_MS = 86_400_000;
/** Vertical padding inside the 0..100 viewBox so peaks never clip. */
const PLOT_TOP = 8;
const PLOT_BOTTOM = 92;

const COMPACT_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const EXACT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function parseDay(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

export function formatChartValue(value: number): string {
  return COMPACT_FORMAT.format(value);
}

export function formatChartValueExact(value: number): string {
  return EXACT_FORMAT.format(value);
}

export function formatChartDate(date: string): string {
  const time = parseDay(date);
  if (time === null) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(time))
    .toUpperCase();
}

export function formatChartDateLong(date: string): string {
  const time = parseDay(date);
  if (time === null) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}

/**
 * The points inside the requested window, anchored at the newest
 * observation. Anchoring at the data (not the clock) keeps a stale series
 * inspectable instead of rendering an empty chart about the present.
 */
export function selectChartWindow(
  series: readonly SocialTrendPoint[],
  timeframe: SocialChartTimeframe,
): SocialTrendPoint[] {
  const byDate = new Map<string, number>();
  for (const point of series) {
    if (parseDay(point.date) !== null && Number.isFinite(point.value)) {
      byDate.set(point.date, point.value);
    }
  }
  const ordered = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = ordered.at(-1);
  if (!latest) return [];
  const latestTime = parseDay(latest.date)!;
  const startTime = latestTime - (timeframe - 1) * DAY_MS;
  return ordered.filter((point) => parseDay(point.date)! >= startTime);
}

function pathFrom(points: readonly SocialChartPoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

export function buildSocialChartModel(
  series: readonly SocialTrendPoint[],
  timeframe: SocialChartTimeframe,
): SocialChartModel {
  const windowed = selectChartWindow(series, timeframe);
  const emptyModel: SocialChartModel = {
    timeframe,
    points: [],
    linePath: null,
    areaPath: null,
    xTicks: [],
    yTicks: [],
    rangeMin: null,
    rangeMax: null,
    observedDays: windowed.length,
    empty: true,
  };
  // One observation cannot honestly draw a trend line.
  if (windowed.length < 2) return emptyModel;

  const times = windowed.map((point) => parseDay(point.date)!);
  const firstTime = times[0];
  const lastTime = times.at(-1)!;
  const span = Math.max(1, lastTime - firstTime);
  const values = windowed.map((point) => point.value);
  const rangeMin = Math.min(...values);
  const rangeMax = Math.max(...values);
  const valueSpan = rangeMax - rangeMin;

  const points = windowed.map((point, index) => {
    const normalized =
      valueSpan === 0 ? 0.5 : (point.value - rangeMin) / valueSpan;
    return {
      date: point.date,
      value: point.value,
      x: ((times[index] - firstTime) / span) * 100,
      y: PLOT_BOTTOM - normalized * (PLOT_BOTTOM - PLOT_TOP),
    };
  });

  const linePath = pathFrom(points);
  const first = points[0];
  const last = points.at(-1)!;
  const areaPath =
    `${linePath} L${last.x.toFixed(2)} 100 ` +
    `L${first.x.toFixed(2)} 100 Z`;

  const midTime = firstTime + Math.round((lastTime - firstTime) / 2 / DAY_MS) * DAY_MS;
  const midDate = new Date(midTime).toISOString().slice(0, 10);
  const xTicks: SocialChartTick[] = [
    { position: 0, label: formatChartDate(first.date) },
    ...(lastTime - firstTime >= 4 * DAY_MS
      ? [
          {
            position: ((midTime - firstTime) / span) * 100,
            label: formatChartDate(midDate),
          },
        ]
      : []),
    { position: 100, label: formatChartDate(last.date) },
  ];
  const yTicks: SocialChartTick[] =
    valueSpan === 0
      ? [{ position: 50, label: formatChartValue(rangeMax) }]
      : [
          { position: PLOT_TOP, label: formatChartValue(rangeMax) },
          { position: PLOT_BOTTOM, label: formatChartValue(rangeMin) },
        ];

  return {
    timeframe,
    points,
    linePath,
    areaPath,
    xTicks,
    yTicks,
    rangeMin,
    rangeMax,
    observedDays: windowed.length,
    empty: false,
  };
}

/** Index of the point nearest to a horizontal fraction (0..100). */
export function nearestPointIndex(
  points: readonly SocialChartPoint[],
  fraction: number,
): number | null {
  if (points.length === 0) return null;
  const clamped = Math.min(100, Math.max(0, fraction));
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(points[index].x - clamped);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The honest window caption: how many days actually reported inside the
 * selected timeframe, or that the window has no history at all.
 */
export function chartWindowSummary(model: SocialChartModel): string {
  if (model.observedDays === 0) return "NO HISTORY FOR THIS WINDOW";
  if (model.empty) {
    return `${model.observedDays}/${model.timeframe}D REPORTED · NEEDS 2+ DAYS`;
  }
  return `${model.observedDays}/${model.timeframe}D REPORTED`;
}
