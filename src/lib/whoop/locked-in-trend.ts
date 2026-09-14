import type { LockedInHistoryPoint } from "./locked-in-score";

/**
 * How the Locked In score moved, in the same language as the social tiles:
 * one arrow, one number, one window.
 *
 *   1D — today's score vs the previous scored day.
 *   1W — today's score vs the average of the previous 7 days.
 *   1M — today's score vs the average of the previous 30 days.
 *
 * Averages (not "the score N days ago") so one odd night cannot flip the
 * week or the month. Every comparison is computed from replayed history
 * where each day only saw itself and earlier days. A connection that stopped
 * reporting (a lost band) still gets a truthful answer "as of" its last
 * recorded day — never a projection, never a zero.
 */

export type LockedInTrendWindow = "1D" | "1W" | "1M";

export const LOCKED_IN_TREND_WINDOWS: readonly LockedInTrendWindow[] = ["1D", "1W", "1M"];

export interface LockedInTrend {
  window: LockedInTrendWindow;
  /** The latest scored day, or null when nothing has ever been scored. */
  latest: { recordedAt: string; score: number } | null;
  /** Signed change in points; null when the comparison cannot be made. */
  delta: number | null;
  /**
   * Signed change as a percentage of the comparison basis:
   * (latest − basis) ÷ basis × 100, one decimal. Null when delta is null or
   * the basis is 0.
   */
  percent: number | null;
  /** The value being compared against (yesterday's score or the average). */
  basisValue: number | null;
  direction: "up" | "down" | "flat" | null;
  /** Human basis for the comparison: "vs yesterday", "vs 7-day avg"… */
  basis: string;
  /** How many earlier scored days went into the comparison. */
  observed: number;
  /** How many days the comparison asked for (1, 7 or 30). */
  expected: number;
  /** Whole days between `now` and the latest scored day (0 = today). */
  staleDays: number | null;
}

const DAY_MS = 86_400_000;

function scoredPoints(history: readonly LockedInHistoryPoint[]): Array<{ at: number; recordedAt: string; score: number }> {
  return history
    .filter((point): point is LockedInHistoryPoint & { score: number } => typeof point.score === "number" && Number.isFinite(point.score))
    .map((point) => ({ at: Date.parse(point.recordedAt), recordedAt: point.recordedAt, score: point.score }))
    .filter((point) => Number.isFinite(point.at))
    .sort((left, right) => left.at - right.at);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function lockedInTrend(
  history: readonly LockedInHistoryPoint[] | undefined,
  window: LockedInTrendWindow,
  now: Date = new Date(),
): LockedInTrend {
  const points = scoredPoints(history ?? []);
  const latest = points.at(-1) ?? null;
  const expected = window === "1D" ? 1 : window === "1W" ? 7 : 30;
  const base: LockedInTrend = {
    window,
    latest: latest ? { recordedAt: latest.recordedAt, score: latest.score } : null,
    delta: null,
    percent: null,
    basisValue: null,
    direction: null,
    basis: window === "1D" ? "vs yesterday" : window === "1W" ? "vs 7-day avg" : "vs 30-day avg",
    observed: 0,
    expected,
    staleDays: latest ? Math.max(0, Math.floor((now.getTime() - latest.at) / DAY_MS)) : null,
  };
  if (!latest) return { ...base, basis: "no scored days yet" };

  const earlier = points.slice(0, -1);
  if (window === "1D") {
    const previous = earlier.at(-1);
    if (!previous) return { ...base, basis: "needs a second scored day" };
    const gapDays = Math.round((latest.at - previous.at) / DAY_MS);
    const delta = latest.score - previous.score;
    return {
      ...base,
      delta,
      percent: percentOf(delta, previous.score),
      basisValue: previous.score,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      basis: gapDays <= 1 ? "vs yesterday" : `vs last scored day (${gapDays}d gap)`,
      observed: 1,
    };
  }

  // Window counts calendar days before the latest scored day.
  const windowStart = latest.at - expected * DAY_MS;
  const inWindow = earlier.filter((point) => point.at >= windowStart);
  const minimum = window === "1W" ? 3 : 10;
  if (inWindow.length < minimum) {
    return {
      ...base,
      observed: inWindow.length,
      basis: `${base.basis} · needs ${minimum}+ days`,
    };
  }
  const basisValue = round(mean(inWindow.map((point) => point.score)), 1);
  const delta = round(latest.score - basisValue, 1);
  return {
    ...base,
    delta,
    percent: percentOf(delta, basisValue),
    basisValue,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    observed: inWindow.length,
  };
}

function percentOf(delta: number, basis: number): number | null {
  if (!Number.isFinite(basis) || basis === 0) return null;
  return round((delta / basis) * 100, 1);
}

/** "7.0%" — the change as a percentage of the basis; the arrow carries the sign. */
export function formatTrendPercent(trend: LockedInTrend): string | null {
  if (trend.percent === null) return null;
  return `${Math.abs(trend.percent).toFixed(1)}%`;
}

/** "+7.0%" / "−3.4%" / "0.0%" — signed, for text that has no arrow. */
export function formatTrendPercentSigned(trend: LockedInTrend): string | null {
  if (trend.percent === null) return null;
  const sign = trend.percent > 0 ? "+" : trend.percent < 0 ? "−" : "";
  return `${sign}${Math.abs(trend.percent).toFixed(1)}%`;
}

/** "+2.4" / "−9" / "0" — the change in points. */
export function formatTrendPoints(trend: LockedInTrend): string | null {
  if (trend.delta === null) return null;
  const magnitude = Math.abs(trend.delta);
  const text = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1);
  const sign = trend.delta > 0 ? "+" : trend.delta < 0 ? "−" : "";
  return `${sign}${text}`;
}

/** Kept for the chip's arrow: "▲" / "▼" / "•". */
export function trendGlyph(trend: LockedInTrend): string | null {
  if (trend.direction === null) return null;
  return trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "•";
}
