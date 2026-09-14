export const SOCIAL_PLATFORM_IDS = [
  "youtube",
  "instagram",
  "tiktok",
] as const;

export type SocialPlatformId = (typeof SOCIAL_PLATFORM_IDS)[number];

export type SocialAudiencePrecision = "exact" | "rounded" | "unknown";

export type SocialTrendMetric = "views" | "reach" | "audience_count";

export type SocialAudienceChangeKind =
  | "net_subscribers"
  | "gross_follows"
  | "snapshot_delta";

export type SocialSyncStatus =
  | "ready"
  | "partial"
  | "credential_pending"
  | "not_connected"
  | "error"
  | "unavailable";

export const SOCIAL_PERIOD_METRIC_KEYS = [
  "views",
  "reach",
  "profileViews",
  "watchMinutes",
  "likes",
  "comments",
  "shares",
  "interactions",
  "accountsEngaged",
  "averageViewDurationSeconds",
  "audienceGained",
  "audienceLost",
] as const;

export type SocialPeriodMetricKey =
  (typeof SOCIAL_PERIOD_METRIC_KEYS)[number];

/**
 * Date-stamped series over the requested window (contract v5 periodSeries).
 * Each series only lists dates where the stored column is non-null; the
 * lifetime/content/following/audience series are capture-date snapshots, the
 * rest are per-day measurements. Never sum a snapshot series.
 */
export const SOCIAL_PERIOD_SERIES_KEYS = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "interactions",
  "accountsEngaged",
  "watchMinutes",
  "lifetimeViews",
  "lifetimeLikes",
  "contentCount",
  "followingCount",
  "audienceCount",
] as const;

export type SocialPeriodSeriesKey =
  (typeof SOCIAL_PERIOD_SERIES_KEYS)[number];

export type SocialPeriodSeries = Record<
  SocialPeriodSeriesKey,
  SocialTrendPoint[]
>;

export interface SocialPeriodMetricEvidence {
  latestMetricDate: string | null;
  observedDayCount: number | null;
}

export interface SocialTrendPoint {
  date: string;
  value: number;
}

/**
 * One published item from the latest per-item capture. Counters are
 * honest-nullable: a provider that could not report one leaves it null.
 */
export interface SocialContentItem {
  contentId: string;
  title: string | null;
  contentType: string | null;
  publishedAt: string | null;
  capturedOn: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  averageViewDurationSeconds: number | null;
}

export interface SocialContentSummary {
  /** The capture date the items belong to; null before any capture exists. */
  latestCapturedOn: string | null;
  /** Item count in the latest capture (may exceed the projected items). */
  observedItemCount: number;
  items: SocialContentItem[];
}

export type SocialGrowthSignal =
  | "above_average"
  | "below_average"
  | "on_average"
  | "calibrating";

export interface SocialDailyAudienceMetrics {
  series: SocialTrendPoint[];
  latestChange: number | null;
  latestChangeDate: string | null;
  average7d: number | null;
  average30d: number | null;
  versus7dAverage: number | null;
  signal: SocialGrowthSignal;
  observedDays: number;
  observedPrior7d: number;
  observedPrior30d: number;
}

export interface SocialPlatformMetrics {
  platform: SocialPlatformId;
  status: SocialSyncStatus;
  headlineLabel: "subscribers" | "followers";
  headlineValue: number | null;
  headlinePrecision: SocialAudiencePrecision;
  lastSyncedAt: string | null;
  sourceDataAsOf: string | null;
  current: {
    following: number | null;
    content: number | null;
    lifetimeViews: number | null;
    lifetimeLikes: number | null;
  };
  trend: {
    daysRequested: number;
    metric: SocialTrendMetric | null;
    series: SocialTrendPoint[];
    peak: number | null;
    rangeMin: number | null;
    rangeMax: number | null;
    audienceVelocityPerDay: number | null;
    audienceChange: number | null;
    audienceChangeKind: SocialAudienceChangeKind | null;
  };
  dailyAudience: SocialDailyAudienceMetrics;
  content: SocialContentSummary;
  periodTotals: {
    views: number | null;
    reach: number | null;
    profileViews: number | null;
    watchMinutes: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    interactions: number | null;
    accountsEngaged: number | null;
    averageViewDurationSeconds: number | null;
    audienceGained: number | null;
    audienceLost: number | null;
  };
  periodEvidence: Record<SocialPeriodMetricKey, SocialPeriodMetricEvidence>;
  /** Contract v5. Absent from older payloads; the parser always fills it. */
  periodSeries?: SocialPeriodSeries;
}

export interface SocialDashboardMetrics {
  generatedAt: string | null;
  platforms: Record<SocialPlatformId, SocialPlatformMetrics>;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function number(value: unknown, allowNegative = false): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) return null;
  return parsed;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function metricDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? value : null;
}

function observedDayCount(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed <= 90
    ? parsed
    : null;
}

function emptyPeriodEvidence(): Record<
  SocialPeriodMetricKey,
  SocialPeriodMetricEvidence
> {
  return Object.fromEntries(
    SOCIAL_PERIOD_METRIC_KEYS.map((key) => [
      key,
      { latestMetricDate: null, observedDayCount: null },
    ]),
  ) as Record<SocialPeriodMetricKey, SocialPeriodMetricEvidence>;
}

function emptyPeriodSeries(): SocialPeriodSeries {
  return Object.fromEntries(
    SOCIAL_PERIOD_SERIES_KEYS.map((key) => [key, [] as SocialTrendPoint[]]),
  ) as SocialPeriodSeries;
}

/**
 * Tolerant periodSeries reader: a missing block, a missing key, or a
 * malformed entry yields an empty series; null values are dropped, never
 * coerced to zero (same rules as every other series in this contract).
 */
function parsePeriodSeries(value: unknown): SocialPeriodSeries {
  const source = record(value);
  return Object.fromEntries(
    SOCIAL_PERIOD_SERIES_KEYS.map((key) => [
      key,
      metricSeries(source?.[key]),
    ]),
  ) as SocialPeriodSeries;
}

function parsePeriodEvidence(
  value: UnknownRecord | null,
): Record<SocialPeriodMetricKey, SocialPeriodMetricEvidence> {
  const output = emptyPeriodEvidence();
  for (const key of SOCIAL_PERIOD_METRIC_KEYS) {
    const evidence = record(value?.[key]);
    output[key] = {
      latestMetricDate: metricDate(evidence?.latestMetricDate),
      observedDayCount: observedDayCount(evidence?.observedDayCount),
    };
  }
  return output;
}

const MAX_CONTENT_ITEMS = 12;

function emptyContentSummary(): SocialContentSummary {
  return { latestCapturedOn: null, observedItemCount: 0, items: [] };
}

function contentText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
    : trimmed;
}

function parseContentSummary(value: UnknownRecord | null): SocialContentSummary {
  if (!value) return emptyContentSummary();
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: SocialContentItem[] = [];
  const seen = new Set<string>();
  for (const candidate of rawItems.slice(0, MAX_CONTENT_ITEMS)) {
    const item = record(candidate);
    const contentId = contentText(item?.contentId, 200);
    if (!item || !contentId || seen.has(contentId)) continue;
    seen.add(contentId);
    items.push({
      contentId,
      title: contentText(item.title, 300),
      contentType: contentText(item.contentType, 80),
      publishedAt: timestamp(item.publishedAt),
      capturedOn: metricDate(item.capturedOn),
      views: number(item.views),
      likes: number(item.likes),
      comments: number(item.comments),
      shares: number(item.shares),
      saves: number(item.saves),
      reach: number(item.reach),
      averageViewDurationSeconds: number(item.averageViewDurationSeconds),
    });
  }
  const observedItemCount = number(value.observedItemCount);
  return {
    latestCapturedOn: metricDate(value.latestCapturedOn),
    observedItemCount:
      observedItemCount !== null && Number.isSafeInteger(observedItemCount)
        ? observedItemCount
        : items.length,
    items,
  };
}

function audiencePrecision(value: unknown): SocialAudiencePrecision {
  return value === "exact" || value === "rounded" ? value : "unknown";
}

function trendMetric(value: unknown): SocialTrendMetric | null {
  return value === "views" || value === "reach" || value === "audience_count"
    ? value
    : null;
}

function audienceChangeKind(value: unknown): SocialAudienceChangeKind | null {
  return value === "net_subscribers" ||
    value === "gross_follows" ||
    value === "snapshot_delta"
    ? value
    : null;
}

function metricSeries(value: unknown, allowNegative = false): SocialTrendPoint[] {
  const points = Array.isArray(value) ? value : [];
  const byDate = new Map<string, number>();

  for (const candidate of points.slice(-90)) {
    const point = record(candidate);
    const date = typeof point?.date === "string" ? point.date.slice(0, 10) : "";
    const metricValue = number(point?.value, allowNegative);
    if (/^\d{4}-\d{2}-\d{2}$/u.test(date) && metricValue !== null) {
      byDate.set(date, metricValue);
    }
  }

  return [...byDate.entries()]
    .map(([date, metricValue]) => ({ date, value: metricValue }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function pointsBeforeLatest(
  series: readonly SocialTrendPoint[],
  calendarDays: number,
): SocialTrendPoint[] {
  const latest = series.at(-1);
  if (!latest) return [];
  const latestTime = Date.parse(`${latest.date}T00:00:00.000Z`);
  const startTime = latestTime - calendarDays * 86_400_000;
  return series.filter((point) => {
    const pointTime = Date.parse(`${point.date}T00:00:00.000Z`);
    return pointTime >= startTime && pointTime < latestTime;
  });
}

export function summarizeDailyAudienceSeries(
  rawSeries: readonly SocialTrendPoint[],
): SocialDailyAudienceMetrics {
  const byDate = new Map<string, number>();
  for (const point of rawSeries) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(point.date) && Number.isFinite(point.value)) {
      byDate.set(point.date, point.value);
    }
  }
  const series = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-90);
  const latest = series.at(-1) ?? null;
  const prior7d = pointsBeforeLatest(series, 7);
  const prior30d = pointsBeforeLatest(series, 30);

  // Missing provider rows are unknown, not zero. Only call a value a 7-day or
  // 30-day average when every calendar day in that comparison window exists.
  const average7d =
    prior7d.length === 7
      ? average(prior7d.map((point) => point.value))
      : null;
  const average30d =
    prior30d.length === 30
      ? average(prior30d.map((point) => point.value))
      : null;
  const versus7dAverage =
    latest && average7d !== null
      ? latest.value - average7d
      : null;
  const signal: SocialGrowthSignal =
    versus7dAverage === null
      ? "calibrating"
      : versus7dAverage > 0
        ? "above_average"
        : versus7dAverage < 0
          ? "below_average"
          : "on_average";

  return {
    series,
    latestChange: latest?.value ?? null,
    latestChangeDate: latest?.date ?? null,
    average7d,
    average30d,
    versus7dAverage,
    signal,
    observedDays: series.length,
    observedPrior7d: prior7d.length,
    observedPrior30d: prior30d.length,
  };
}

function platformId(value: unknown): SocialPlatformId | null {
  return SOCIAL_PLATFORM_IDS.find((platform) => platform === value) ?? null;
}

function status(value: unknown): SocialSyncStatus {
  return value === "ready" ||
    value === "partial" ||
    value === "credential_pending" ||
    value === "error"
    ? value
    : "unavailable";
}

function emptyPlatform(
  platform: SocialPlatformId,
  emptyStatus: "not_connected" | "unavailable" = "unavailable",
): SocialPlatformMetrics {
  return {
    platform,
    status: emptyStatus,
    headlineLabel: platform === "youtube" ? "subscribers" : "followers",
    headlineValue: null,
    headlinePrecision: "unknown",
    lastSyncedAt: null,
    sourceDataAsOf: null,
    current: {
      following: null,
      content: null,
      lifetimeViews: null,
      lifetimeLikes: null,
    },
    trend: {
      daysRequested: 30,
      metric: null,
      series: [],
      peak: null,
      rangeMin: null,
      rangeMax: null,
      audienceVelocityPerDay: null,
      audienceChange: null,
      audienceChangeKind: null,
    },
    dailyAudience: summarizeDailyAudienceSeries([]),
    content: emptyContentSummary(),
    periodTotals: {
      views: null,
      reach: null,
      profileViews: null,
      watchMinutes: null,
      likes: null,
      comments: null,
      shares: null,
      interactions: null,
      accountsEngaged: null,
      averageViewDurationSeconds: null,
      audienceGained: null,
      audienceLost: null,
    },
    periodEvidence: emptyPeriodEvidence(),
    periodSeries: emptyPeriodSeries(),
  };
}

export function emptySocialDashboardMetrics(): SocialDashboardMetrics {
  return {
    generatedAt: null,
    platforms: {
      youtube: emptyPlatform("youtube"),
      instagram: emptyPlatform("instagram"),
      tiktok: emptyPlatform("tiktok"),
    },
  };
}

function parsePlatform(
  value: UnknownRecord,
  platform: SocialPlatformId,
): SocialPlatformMetrics {
  const headline = record(value.headline);
  const current = record(value.current);
  const trend = record(value.trend);
  const range = record(trend?.range);
  const dailyAudience = record(value.dailyAudience);
  const periodTotals = record(value.periodTotals);
  const periodEvidence = record(value.periodEvidence);
  const series = metricSeries(trend?.series);

  return {
    platform,
    status: status(value.status),
    headlineLabel: platform === "youtube" ? "subscribers" : "followers",
    headlineValue: number(headline?.value),
    headlinePrecision: audiencePrecision(headline?.precision),
    lastSyncedAt: timestamp(value.lastSyncedAt),
    sourceDataAsOf: timestamp(value.sourceDataAsOf),
    current: {
      following: number(current?.following),
      content: number(current?.content),
      lifetimeViews: number(current?.lifetimeViews),
      lifetimeLikes: number(current?.lifetimeLikes),
    },
    trend: {
      daysRequested: Math.min(90, Math.max(2, number(trend?.daysRequested) ?? 30)),
      metric: trendMetric(trend?.metric),
      series,
      peak: number(trend?.peak),
      rangeMin: number(range?.min),
      rangeMax: number(range?.max),
      audienceVelocityPerDay: number(trend?.audienceVelocityPerDay, true),
      audienceChange: number(trend?.audienceChange, true),
      audienceChangeKind: audienceChangeKind(trend?.audienceChangeKind),
    },
    dailyAudience: summarizeDailyAudienceSeries(
      metricSeries(dailyAudience?.series, true),
    ),
    content: parseContentSummary(record(value.content)),
    periodTotals: {
      views: number(periodTotals?.views),
      reach: number(periodTotals?.reach),
      profileViews: number(periodTotals?.profileViews),
      watchMinutes: number(periodTotals?.watchMinutes),
      likes: number(periodTotals?.likes),
      comments: number(periodTotals?.comments),
      shares: number(periodTotals?.shares),
      interactions: number(periodTotals?.interactions),
      accountsEngaged: number(periodTotals?.accountsEngaged),
      averageViewDurationSeconds: number(
        periodTotals?.averageViewDurationSeconds,
      ),
      audienceGained: number(periodTotals?.audienceGained),
      audienceLost: number(periodTotals?.audienceLost),
    },
    periodEvidence: parsePeriodEvidence(periodEvidence),
    periodSeries: parsePeriodSeries(value.periodSeries),
  };
}

export function parseSocialDashboardContract(
  value: unknown,
): SocialDashboardMetrics {
  const contract = record(value);
  const output: SocialDashboardMetrics = {
    generatedAt: timestamp(contract?.generatedAt),
    platforms: {
      youtube: emptyPlatform("youtube", "not_connected"),
      instagram: emptyPlatform("instagram", "not_connected"),
      tiktok: emptyPlatform("tiktok", "not_connected"),
    },
  };
  const platforms = Array.isArray(contract?.platforms)
    ? contract.platforms
    : [];

  for (const candidate of platforms.slice(0, SOCIAL_PLATFORM_IDS.length)) {
    const source = record(candidate);
    const platform = platformId(source?.platform);
    if (!source || !platform) continue;
    output.platforms[platform] = parsePlatform(source, platform);
  }

  return output;
}
