import {
  formatChartDate,
  formatChartValue,
  formatChartValueExact,
} from "./social-chart-core";
import type {
  SocialDashboardMetrics,
  SocialPlatformId,
  SocialPlatformMetrics,
  SocialTrendPoint,
} from "./social-metrics";

/**
 * Headline delta tiles and the context line for the social platform cards.
 *
 * Pure on purpose. Every value here is derived from the stored contract
 * (`SocialDashboardMetrics`) and a selected window; nothing is estimated and
 * nothing missing is ever rendered as zero. Windows are anchored at the newest
 * observation of the series they summarise (the same rule the chart and
 * `summarizeDailyAudienceSeries` use), and a window only claims a comparison
 * when every calendar day inside both windows was actually observed.
 */

export const SOCIAL_HEADLINE_RANGES = [1, 7, 30] as const;

export type SocialHeadlineRange = (typeof SOCIAL_HEADLINE_RANGES)[number];

/**
 * YouTube changed how public view counts are computed on this date: a view is
 * now counted from the moment playback starts, per YouTube's own announcement
 * of the change (August 2026). Daily view totals on or after this date are
 * therefore structurally higher than earlier days, so any window that reaches
 * this date, and any comparison against days before it, is inflated. The UI
 * says so instead of pretending the series is continuous.
 */
export const YOUTUBE_VIEW_COUNT_CHANGE_DATE = "2026-08-18";

export const YOUTUBE_VIEW_COUNT_CHANGE_NOTE =
  "YouTube changed how public views are counted (from play start) — comparisons across that date are inflated.";

export const TIKTOK_NO_DAILY_VIEWS_NOTE = "no daily views from TikTok API";
export const TIKTOK_NO_LIKES_TOTAL_NOTE = "no 30D likes from TikTok API";
export const YOUTUBE_PARTIAL_TODAY_NOTE = "excludes today (partial day)";

const DAY_MS = 86_400_000;

export type SocialDeltaSign = "up" | "down" | "flat" | "na";

export interface SeriesWindow {
  /** Calendar days the window spans. */
  days: number;
  startDate: string | null;
  endDate: string | null;
  /** Observed points inside the window. */
  observed: number;
  /** Sum of the observed points, or null when nothing was observed. */
  sum: number | null;
  /** True only when every calendar day in the window was observed. */
  complete: boolean;
}

export interface SeriesComparison extends SeriesWindow {
  /**
   * Percent change of the current window against this (previous) window.
   * Null unless both windows are complete and the previous sum is non-zero.
   */
  percent: number | null;
}

export type SocialDeltaTileKey =
  | "audience"
  | "views"
  | "reach"
  | "likes"
  | "interactions";

export interface HeadlineDeltaTile {
  key: SocialDeltaTileKey;
  /** Metric label, e.g. "NET SUBS", "GROSS FOLLOWS", "VIEWS". */
  label: string;
  /** Window label rendered as the pill: "1D" | "7D" | "30D". */
  rangeLabel: string;
  /**
   * True when the tile cannot follow the selected range because the contract
   * only stores a 30-day total for it. Its pill stays "30D".
   */
  fixedRange: boolean;
  /** "delta" values are signed changes; "total" values are period sums. */
  kind: "delta" | "total";
  value: number | null;
  sign: SocialDeltaSign;
  observed: number;
  expected: number;
  complete: boolean;
  startDate: string | null;
  endDate: string | null;
  comparison: SeriesComparison | null;
  /** Honest caveats, rendered under the value. */
  notes: string[];
  /**
   * How an incomplete window is worded: "observed" for series that only
   * exist on capture dates (TikTok snapshots), otherwise plain days.
   */
  observedLabel?: "observed";
}

export interface HeadlineDeltas {
  platform: SocialPlatformId;
  range: SocialHeadlineRange;
  tiles: HeadlineDeltaTile[];
}

export interface ContextItem {
  key: string;
  label: string;
  value: string;
  note: string | null;
}

export interface BestDay {
  date: string;
  value: number;
  observed: number;
  expected: number;
}

export interface Milestone {
  target: number;
  remaining: number;
  perDay: number;
  days: number;
}

// -- calendar helpers -------------------------------------------------------

function dayNumber(date: string | null | undefined): number | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return null;
  }
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

function dateFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string | null {
  const day = dayNumber(date);
  return day === null ? null : dateFromDayNumber(day + days);
}

// -- windows ----------------------------------------------------------------

/**
 * Sum the points inside the `days` calendar days ending at `endDate`
 * (inclusive). Missing days are counted, never filled: `sum` is null when
 * nothing was observed and `complete` is false whenever any day is missing.
 */
export function windowSum(
  series: readonly SocialTrendPoint[],
  days: number,
  endDate: string | null,
): SeriesWindow {
  const expected = Math.max(1, Math.floor(days));
  const endDay = dayNumber(endDate);
  if (endDay === null) {
    return {
      days: expected,
      startDate: null,
      endDate: null,
      observed: 0,
      sum: null,
      complete: false,
    };
  }
  const startDay = endDay - (expected - 1);
  const seen = new Set<number>();
  let sum = 0;
  for (const point of series) {
    const day = dayNumber(point.date);
    if (day === null || day < startDay || day > endDay) continue;
    if (!Number.isFinite(point.value) || seen.has(day)) continue;
    seen.add(day);
    sum += point.value;
  }
  const observed = seen.size;
  return {
    days: expected,
    startDate: dateFromDayNumber(startDay),
    endDate: dateFromDayNumber(endDay),
    observed,
    sum: observed === 0 ? null : sum,
    complete: observed === expected,
  };
}

/**
 * The window immediately before `current`, plus the percent change of the
 * current window against it. The percent exists only when both windows are
 * complete and the previous sum is non-zero.
 */
export function compareWithPreviousWindow(
  series: readonly SocialTrendPoint[],
  current: SeriesWindow,
): SeriesComparison | null {
  if (!current.startDate) return null;
  const previousEnd = shiftDate(current.startDate, -1);
  const previous = windowSum(series, current.days, previousEnd);
  const percent =
    current.complete &&
    previous.complete &&
    current.sum !== null &&
    previous.sum !== null &&
    previous.sum !== 0
      ? ((current.sum - previous.sum) / Math.abs(previous.sum)) * 100
      : null;
  return { ...previous, percent };
}

/**
 * The date a platform series is summarised up to. Windows anchor at the
 * newest observation, so a lagging feed reads as "through AUG 15" rather
 * than as an empty present. YouTube's daily views are the exception: the
 * current UTC day is still filling in and gets overwritten by later syncs,
 * so when the newest point is today the anchor steps back one day.
 */
export function seriesAnchor(
  series: readonly SocialTrendPoint[],
  options: { today: string; excludeToday?: boolean },
): string | null {
  const latest = series.at(-1)?.date ?? null;
  if (latest === null) return null;
  if (options.excludeToday && latest === options.today) {
    return shiftDate(latest, -1);
  }
  return latest;
}

export function deltaSign(value: number | null): SocialDeltaSign {
  if (value === null || !Number.isFinite(value)) return "na";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function rangeLabel(days: number): string {
  return `${days}D`;
}

function deltaTileFromWindow(
  key: SocialDeltaTileKey,
  label: string,
  series: readonly SocialTrendPoint[],
  range: SocialHeadlineRange,
  endDate: string | null,
  notes: string[] = [],
): HeadlineDeltaTile {
  const window = windowSum(series, range, endDate);
  const comparison = compareWithPreviousWindow(series, window);
  return {
    key,
    label,
    rangeLabel: rangeLabel(range),
    fixedRange: false,
    kind: "delta",
    value: window.sum,
    sign: deltaSign(window.sum),
    observed: window.observed,
    expected: window.days,
    complete: window.complete,
    startDate: window.startDate,
    endDate: window.endDate,
    comparison,
    notes,
  };
}

function unavailableTile(
  key: SocialDeltaTileKey,
  label: string,
  range: SocialHeadlineRange,
  note: string,
  fixedRange = false,
): HeadlineDeltaTile {
  return {
    key,
    label,
    rangeLabel: fixedRange ? "30D" : rangeLabel(range),
    fixedRange,
    kind: fixedRange ? "total" : "delta",
    value: null,
    sign: "na",
    observed: 0,
    expected: fixedRange ? 30 : range,
    complete: false,
    startDate: null,
    endDate: null,
    comparison: null,
    notes: [note],
  };
}

/**
 * The contract only carries a 30-day total for likes / interactions (no
 * per-day series), so this tile is pinned to "30D" whatever range is
 * selected rather than pretending a 1D or 7D figure exists.
 */
function periodTotalTile(
  key: "likes" | "interactions",
  label: string,
  platform: SocialPlatformMetrics,
  missingNote: string,
): HeadlineDeltaTile {
  const value = platform.periodTotals[key];
  const evidence = platform.periodEvidence[key];
  const observed = evidence.observedDayCount;
  if (value === null) {
    return unavailableTile(key, label, 30, missingNote, true);
  }
  return {
    key,
    label,
    rangeLabel: "30D",
    fixedRange: true,
    kind: "total",
    value,
    sign: "flat",
    observed: observed ?? 0,
    expected: 30,
    complete: observed === 30,
    startDate: null,
    endDate: evidence.latestMetricDate,
    comparison: null,
    notes: [],
  };
}

function youtubeViewsNotes(window: {
  endDate: string | null;
  comparison: SeriesComparison | null;
}, excludedToday: boolean): string[] {
  const notes: string[] = [];
  if (excludedToday) notes.push(YOUTUBE_PARTIAL_TODAY_NOTE);
  const end = dayNumber(window.endDate);
  const change = dayNumber(YOUTUBE_VIEW_COUNT_CHANGE_DATE);
  if (end !== null && change !== null && end >= change) {
    notes.push(YOUTUBE_VIEW_COUNT_CHANGE_NOTE);
  }
  return notes;
}

/**
 * The delta tiles for one platform card at the selected range.
 *
 * Field → tile mapping:
 * - YouTube: audience ← `dailyAudience.series` (gained − lost per day, net);
 *   views ← `trend.series` (metric "views", newest partial day excluded);
 *   likes ← `periodTotals.likes` (30-day total only).
 * - Instagram: audience ← `dailyAudience.series` (Meta `follower_count`, gross
 *   follows — unfollows are invisible, so it is labelled GROSS FOLLOWS);
 *   reach ← `trend.series` (metric "reach", sum of daily reach);
 *   interactions ← `periodTotals.interactions` (30-day total only).
 * - TikTok: audience ← `dailyAudience.series` (follower snapshot deltas on
 *   capture dates; gaps read as "n/N days"); views ← none (the TikTok API
 *   gives no daily views); likes ← none (no 30-day likes total is stored).
 */
export function headlineDeltas(
  platformId: SocialPlatformId,
  range: SocialHeadlineRange,
  metrics: SocialDashboardMetrics,
  options: {
    today?: string;
    /**
     * A longer read of the same trend series (the 90-day chart feed). It
     * only ever extends `trend.series`, so a 30-day window can be compared
     * against the 30 days before it. Ignored when shorter than the contract's
     * own series.
     */
    extendedTrendSeries?: readonly SocialTrendPoint[] | null;
  } = {},
): HeadlineDeltas {
  const today = options.today ?? utcToday();
  const platform = metrics.platforms[platformId];
  const audienceSeries = platform.dailyAudience.series;
  const audienceAnchor = seriesAnchor(audienceSeries, { today });
  const extended = options.extendedTrendSeries ?? [];
  const trendSeries =
    extended.length > platform.trend.series.length ? extended : platform.trend.series;

  if (platformId === "youtube") {
    const viewSeries = platform.trend.metric === "views" ? trendSeries : [];
    const viewAnchor = seriesAnchor(viewSeries, { today, excludeToday: true });
    const excludedToday =
      viewSeries.length > 0 && viewSeries.at(-1)?.date === today;
    const views = deltaTileFromWindow("views", "VIEWS", viewSeries, range, viewAnchor);
    views.notes = youtubeViewsNotes(views, excludedToday);
    return {
      platform: platformId,
      range,
      tiles: [
        deltaTileFromWindow("audience", "NET SUBS", audienceSeries, range, audienceAnchor),
        views,
        periodTotalTile("likes", "LIKES", platform, "no 30D likes stored"),
      ],
    };
  }

  if (platformId === "instagram") {
    const reachSeries = platform.trend.metric === "reach" ? trendSeries : [];
    const reachAnchor = seriesAnchor(reachSeries, { today });
    return {
      platform: platformId,
      range,
      tiles: [
        deltaTileFromWindow("audience", "GROSS FOLLOWS", audienceSeries, range, audienceAnchor),
        deltaTileFromWindow("reach", "REACH", reachSeries, range, reachAnchor),
        periodTotalTile("interactions", "INTERACTIONS", platform, "no 30D interactions stored"),
      ],
    };
  }

  // TikTok follower deltas exist only on capture dates; a window with gaps
  // reads "n/N DAYS OBSERVED" through the tile subline rather than as a
  // daily rate.
  const audience = deltaTileFromWindow(
    "audience",
    "NET FOLLOWERS",
    audienceSeries,
    range,
    audienceAnchor,
  );
  audience.observedLabel = "observed";
  return {
    platform: platformId,
    range,
    tiles: [
      audience,
      unavailableTile("views", "VIEWS", range, TIKTOK_NO_DAILY_VIEWS_NOTE),
      unavailableTile("likes", "LIKES", range, TIKTOK_NO_LIKES_TOTAL_NOTE, true),
    ],
  };
}

// -- presentation strings ---------------------------------------------------

const SIGNED_EXACT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});
const SIGNED_COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const PERCENT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function formatDeltaValue(tile: Pick<HeadlineDeltaTile, "value" | "kind">): string {
  if (tile.value === null) return "—";
  const rounded = Math.round(tile.value);
  if (tile.kind === "total") {
    return Math.abs(rounded) >= 100_000
      ? formatChartValue(rounded)
      : formatChartValueExact(rounded);
  }
  return Math.abs(rounded) >= 100_000
    ? SIGNED_COMPACT.format(rounded)
    : SIGNED_EXACT.format(rounded);
}

export function deltaGlyph(tile: Pick<HeadlineDeltaTile, "sign" | "kind">): string {
  if (tile.kind === "total" || tile.sign === "na") return "";
  if (tile.sign === "up") return "▲";
  if (tile.sign === "down") return "▼";
  return "●";
}

export function formatPercent(percent: number): string {
  const rounded =
    Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;
  return `${PERCENT_FORMAT.format(rounded)}%`;
}

/**
 * The second line of a tile. It only claims a comparison when both windows
 * are complete; otherwise it reports how many days were actually observed.
 */
export function deltaSubline(tile: HeadlineDeltaTile): string | null {
  if (tile.value === null) return null;
  if (tile.kind === "total") {
    return tile.observed > 0 && tile.observed < tile.expected
      ? `${tile.observed}/${tile.expected} DAYS`
      : null;
  }
  if (!tile.complete) {
    // TikTok follower deltas exist only on capture dates, so its gaps are
    // named for what they are; elsewhere a short window is simply short.
    return tile.observedLabel === "observed"
      ? `${tile.observed}/${tile.expected} DAYS OBSERVED`
      : `${tile.observed}/${tile.expected} DAYS`;
  }
  const comparison = tile.comparison;
  if (!comparison) return null;
  const windowName = tile.expected === 1 ? "PREV DAY" : `PREV ${tile.expected}D`;
  if (comparison.complete) {
    return comparison.percent === null
      ? `VS ${windowName} n/a`
      : `VS ${windowName} ${formatPercent(comparison.percent)}`;
  }
  return `PRIOR ${comparison.observed}/${comparison.days} DAYS`;
}

/**
 * The tile's second line, in plain words: the same truth, but readable
 * without knowing dashboard jargon ("vs prev" told nobody anything).
 *   "22/30 DAYS"            → "22/30 days"
 *   "5/7 DAYS OBSERVED"     → "5/7 days"
 *   "PRIOR 2/7 DAYS"        → "prior 7d: only 2 days"
 *   "VS PREV 7D +10%"       → "10% above last 7d"
 *   "VS PREV DAY -3%"       → "3% below yesterday"
 *   "VS PREV DAY 0%"        → "even with yesterday"
 *   "VS PREV 30D n/a"       → "no comparison yet"
 */
export function compactSubline(subline: string | null): string | null {
  if (!subline) return null;
  const observed = /^(\d+)\/(\d+) DAYS(?: OBSERVED)?$/u.exec(subline);
  if (observed) return `${observed[1]}/${observed[2]} days`;
  // The prior window did not report enough days to compare against.
  const prior = /^PRIOR (\d+)\/(\d+) DAYS$/u.exec(subline);
  if (prior) {
    return `prior ${prior[2]}d: only ${prior[1]} ${prior[1] === "1" ? "day" : "days"}`;
  }
  // Comparisons read as words: the sign lives in "above/below", the window
  // is named, and an impossible comparison says so instead of "n/a".
  const versus = /^VS PREV (DAY|\d+D) (.+)$/u.exec(subline);
  if (versus) {
    const windowName =
      versus[1] === "DAY" ? "yesterday" : `last ${versus[1].toLowerCase()}`;
    const value = versus[2];
    if (value === "n/a") return "no comparison yet";
    const signed = /^([+-])(.+)%$/u.exec(value);
    if (!signed) return `even with ${windowName}`;
    return `${signed[2]}% ${signed[1] === "+" ? "above" : "below"} ${windowName}`;
  }
  return subline.toLowerCase();
}

// -- context line -----------------------------------------------------------

/**
 * The next round number above `value`: one step of the digit below the
 * leading one (12,345 → 13,000; 987 → 990; 1,234,567 → 1,300,000).
 */
export function nextMilestone(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(10, value))));
  const step = Math.max(10, magnitude / 10);
  return (Math.floor(value / step) + 1) * step;
}

/**
 * Days to the next milestone at the given daily pace. Only meaningful for a
 * positive pace built from complete data; the caller passes
 * `dailyAudience.average7d`, which is already null unless all seven prior
 * days were observed.
 */
export function daysToMilestone(
  value: number | null,
  perDay: number | null,
): Milestone | null {
  if (value === null || perDay === null || !(perDay > 0)) return null;
  const target = nextMilestone(value);
  if (target === null) return null;
  const remaining = target - value;
  return { target, remaining, perDay, days: Math.max(1, Math.ceil(remaining / perDay)) };
}

export function bestDay(
  series: readonly SocialTrendPoint[],
  days: number,
  endDate: string | null,
): BestDay | null {
  const window = windowSum(series, days, endDate);
  if (window.observed === 0 || !window.startDate || !window.endDate) return null;
  const start = dayNumber(window.startDate) ?? 0;
  const end = dayNumber(window.endDate) ?? 0;
  let best: SocialTrendPoint | null = null;
  for (const point of series) {
    const day = dayNumber(point.date);
    if (day === null || day < start || day > end) continue;
    if (!best || point.value > best.value) best = point;
  }
  return best
    ? { date: best.date, value: best.value, observed: window.observed, expected: window.days }
    : null;
}

function compact(value: number): string {
  return Math.abs(value) >= 10_000
    ? formatChartValue(value)
    : formatChartValueExact(value);
}

function milestoneItem(
  platform: SocialPlatformMetrics,
  paceLabel: string,
): ContextItem | null {
  const milestone = daysToMilestone(
    platform.headlineValue,
    platform.dailyAudience.average7d,
  );
  if (!milestone) return null;
  return {
    key: "milestone",
    label: `NEXT ${compact(milestone.target)}`,
    value: `~${milestone.days}D`,
    note: paceLabel,
  };
}

/**
 * Lifetime / context values that exist in the contract, plus the derived
 * facts that are truthfully computable from it. Every item is omitted when
 * its source is null.
 */
export function contextLine(
  platformId: SocialPlatformId,
  metrics: SocialDashboardMetrics,
  options: { today?: string } = {},
): ContextItem[] {
  const today = options.today ?? utcToday();
  const platform = metrics.platforms[platformId];
  const items: ContextItem[] = [];

  if (platformId === "youtube") {
    if (platform.current.lifetimeViews !== null) {
      items.push({
        key: "lifetimeViews",
        label: "TOTAL VIEWS",
        value: compact(platform.current.lifetimeViews),
        note: null,
      });
    }
    if (platform.current.content !== null) {
      items.push({
        key: "videos",
        label: "VIDEOS",
        value: formatChartValueExact(platform.current.content),
        note: null,
      });
    }
    if (platform.periodTotals.watchMinutes !== null) {
      const observed = platform.periodEvidence.watchMinutes.observedDayCount;
      items.push({
        key: "watch",
        label: "30D WATCH",
        value: `${compact(Math.round(platform.periodTotals.watchMinutes / 60))}h`,
        note: observed !== null && observed < 30 ? `${observed}/30D` : null,
      });
    }
    const viewSeries = platform.trend.metric === "views" ? platform.trend.series : [];
    const best = bestDay(
      viewSeries,
      30,
      seriesAnchor(viewSeries, { today, excludeToday: true }),
    );
    if (best) {
      items.push({
        key: "bestDay",
        label: "BEST DAY",
        value: `${compact(best.value)} · ${formatChartDate(best.date)}`,
        note: best.observed < best.expected ? `${best.observed}/30D` : null,
      });
    }
    const milestone = milestoneItem(platform, "AT 7D NET PACE");
    if (milestone) items.push(milestone);
    return items;
  }

  if (platformId === "instagram") {
    if (platform.current.content !== null) {
      items.push({
        key: "posts",
        label: "POSTS",
        value: formatChartValueExact(platform.current.content),
        note: null,
      });
    }
    if (platform.trend.peak !== null) {
      const reachSeries = platform.trend.metric === "reach" ? platform.trend.series : [];
      const peakPoint = reachSeries.find((point) => point.value === platform.trend.peak);
      items.push({
        key: "peakReach",
        label: "PEAK REACH",
        value: peakPoint
          ? `${compact(platform.trend.peak)} · ${formatChartDate(peakPoint.date)}`
          : compact(platform.trend.peak),
        note: null,
      });
    }
    const milestone = milestoneItem(platform, "AT 7D GROSS PACE");
    if (milestone) items.push(milestone);
    return items;
  }

  if (platform.current.lifetimeLikes !== null) {
    items.push({
      key: "lifetimeLikes",
      label: "TOTAL LIKES",
      value: compact(platform.current.lifetimeLikes),
      note: null,
    });
  }
  if (platform.current.following !== null) {
    items.push({
      key: "following",
      label: "FOLLOWING",
      value: formatChartValueExact(platform.current.following),
      note: null,
    });
  }
  if (platform.current.content !== null) {
    items.push({
      key: "videos",
      label: "VIDEOS",
      value: formatChartValueExact(platform.current.content),
      note: null,
    });
  }
  const milestone = milestoneItem(platform, "AT 7D SNAPSHOT PACE");
  if (milestone) items.push(milestone);
  return items;
}

/**
 * Why a card has nothing to show, in the platform's own status words. Null
 * when the platform is connected and has stored metrics.
 */
export function platformStatusNote(platform: SocialPlatformMetrics): string | null {
  if (platform.status === "not_connected") return "NOT CONNECTED";
  if (platform.status === "credential_pending") return "CREDENTIAL PENDING";
  if (platform.status === "unavailable" || platform.status === "error") {
    return "DATABASE READ UNAVAILABLE";
  }
  if (platform.headlineValue === null) return "NO STORED METRICS";
  return null;
}
