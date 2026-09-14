/**
 * Demo social metrics for the ROWZY starter.
 *
 * Everything the social core, analytics hub and progress detail read comes
 * from this file — no API keys, no network, no store. The numbers are
 * deterministic (seeded noise) but the dates are always relative to the
 * request time, so the dashboard reads as freshly synced.
 */

import {
  SOCIAL_PERIOD_METRIC_KEYS,
  SOCIAL_PERIOD_SERIES_KEYS,
  type SocialAudienceChangeKind,
  type SocialContentItem,
  type SocialDashboardMetrics,
  type SocialPeriodMetricKey,
  type SocialPeriodSeries,
  type SocialPlatformId,
  type SocialPlatformMetrics,
  type SocialTrendMetric,
  type SocialTrendPoint,
} from "./social-metrics";

/* -- deterministic noise --------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(base: Date, daysAgo: number): string {
  const d = new Date(base.getTime() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * An upward-trending daily series over `days` days ending yesterday whose
 * values sum exactly to `total`.
 */
function trendingDailySeries(
  base: Date,
  days: number,
  total: number,
  seed: number,
): SocialTrendPoint[] {
  const random = mulberry32(seed);
  const weights: number[] = [];
  for (let i = 0; i < days; i += 1) {
    // Grows from 1.0 to ~2.1 across the window with ±18% noise.
    const growth = 1 + (1.1 * i) / Math.max(1, days - 1);
    weights.push(growth * (0.82 + random() * 0.36));
  }
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const values = weights.map((weight) =>
    Math.max(0, Math.round((weight / weightSum) * total)),
  );
  const drift = total - values.reduce((sum, value) => sum + value, 0);
  values[values.length - 1] = Math.max(0, values[values.length - 1] + drift);
  return values.map((value, index) => ({
    date: isoDay(base, days - index),
    value,
  }));
}

/** Snapshot series climbing from `end - change` to exactly `end`. */
function snapshotSeries(
  base: Date,
  days: number,
  end: number,
  change: number,
  seed: number,
): SocialTrendPoint[] {
  const gains = trendingDailySeries(base, days, change, seed);
  let running = end - change;
  return gains.map((point) => {
    running += point.value;
    return { date: point.date, value: running };
  });
}

function scaledSeries(
  series: readonly SocialTrendPoint[],
  factor: number,
): SocialTrendPoint[] {
  return series.map((point) => ({
    date: point.date,
    value: Math.max(0, Math.round(point.value * factor)),
  }));
}

/* -- the three demo channels ----------------------------------------------- */

interface DemoPlatformSpec {
  platform: SocialPlatformId;
  seed: number;
  headlineLabel: "subscribers" | "followers";
  headlineValue: number;
  audienceChange: number;
  audienceChangeKind: SocialAudienceChangeKind;
  trendMetric: SocialTrendMetric;
  /** 30-day total of the trend metric (views or reach). */
  trendTotal30: number;
  periodTotals: SocialPlatformMetrics["periodTotals"];
  current: SocialPlatformMetrics["current"];
  content: readonly {
    title: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
  }[];
}

const DEMO_PLATFORMS: readonly DemoPlatformSpec[] = [
  {
    platform: "youtube",
    seed: 11,
    headlineLabel: "subscribers",
    headlineValue: 12_406,
    audienceChange: 312,
    audienceChangeKind: "net_subscribers",
    trendMetric: "views",
    trendTotal30: 48_102,
    periodTotals: {
      views: 48_102,
      reach: null,
      profileViews: null,
      watchMinutes: 187_420,
      likes: 6_118,
      comments: 512,
      shares: 894,
      interactions: 7_524,
      accountsEngaged: null,
      averageViewDurationSeconds: 252,
      audienceGained: 384,
      audienceLost: 72,
    },
    current: {
      following: 24,
      content: 142,
      lifetimeViews: 1_842_310,
      lifetimeLikes: 128_461,
    },
    content: [
      {
        title: "Morning routine that fixed my sleep",
        views: 18_120,
        likes: 1_904,
        comments: 212,
        shares: 341,
      },
      {
        title: "30 days of tracking every heartbeat",
        views: 12_850,
        likes: 1_441,
        comments: 187,
        shares: 268,
      },
      {
        title: "Building my own health dashboard",
        views: 9_220,
        likes: 1_010,
        comments: 96,
        shares: 154,
      },
    ],
  },
  {
    platform: "instagram",
    seed: 23,
    headlineLabel: "followers",
    headlineValue: 24_881,
    audienceChange: 402,
    audienceChangeKind: "gross_follows",
    trendMetric: "reach",
    trendTotal30: 61_548,
    periodTotals: {
      views: null,
      reach: 61_548,
      profileViews: 4_326,
      watchMinutes: null,
      likes: 8_914,
      comments: 733,
      shares: 1_206,
      interactions: 10_853,
      accountsEngaged: 9_428,
      averageViewDurationSeconds: null,
      audienceGained: 402,
      audienceLost: null,
    },
    current: {
      following: 186,
      content: 388,
      lifetimeViews: null,
      lifetimeLikes: 214_806,
    },
    content: [
      {
        title: "Gym PR reel",
        views: 22_400,
        likes: 1_982,
        comments: 143,
        shares: 361,
      },
      {
        title: "Behind the dashboard",
        views: 14_090,
        likes: 1_204,
        comments: 88,
        shares: 197,
      },
      {
        title: "Week of meals carousel",
        views: 9_830,
        likes: 861,
        comments: 57,
        shares: 122,
      },
    ],
  },
  {
    platform: "tiktok",
    seed: 37,
    headlineLabel: "followers",
    headlineValue: 8_932,
    audienceChange: 186,
    audienceChangeKind: "snapshot_delta",
    trendMetric: "views",
    trendTotal30: 102_338,
    periodTotals: {
      views: 102_338,
      reach: null,
      profileViews: null,
      watchMinutes: 44_128,
      likes: 11_204,
      comments: 862,
      shares: 1_536,
      interactions: 13_602,
      accountsEngaged: null,
      averageViewDurationSeconds: 26,
      audienceGained: 214,
      audienceLost: 28,
    },
    current: {
      following: 92,
      content: 214,
      lifetimeViews: 3_864_120,
      lifetimeLikes: 512_338,
    },
    content: [
      {
        title: "POV: your dashboard talks back",
        views: 61_000,
        likes: 8_100,
        comments: 620,
        shares: 940,
      },
      {
        title: "3 signs you are overtraining",
        views: 24_500,
        likes: 2_800,
        comments: 240,
        shares: 410,
      },
      {
        title: "Desk setup in 15 seconds",
        views: 16_700,
        likes: 1_300,
        comments: 102,
        shares: 186,
      },
    ],
  },
] as const;

/* -- assembly --------------------------------------------------------------- */

function buildPeriodSeries(
  spec: DemoPlatformSpec,
  base: Date,
  trendSeries30: SocialTrendPoint[],
): SocialPeriodSeries {
  const empty = Object.fromEntries(
    SOCIAL_PERIOD_SERIES_KEYS.map((key) => [key, [] as SocialTrendPoint[]]),
  ) as SocialPeriodSeries;

  const totals = spec.periodTotals;
  const metricSeriesFor = (
    total: number | null,
    seedOffset: number,
  ): SocialTrendPoint[] =>
    total === null
      ? []
      : trendingDailySeries(base, 30, total, spec.seed + seedOffset);

  const series: SocialPeriodSeries = {
    ...empty,
    views: spec.trendMetric === "views" ? trendSeries30 : metricSeriesFor(totals.views, 101),
    reach: spec.trendMetric === "reach" ? trendSeries30 : metricSeriesFor(totals.reach, 102),
    likes: metricSeriesFor(totals.likes, 103),
    comments: metricSeriesFor(totals.comments, 104),
    shares: metricSeriesFor(totals.shares, 105),
    interactions: metricSeriesFor(totals.interactions, 106),
    accountsEngaged: metricSeriesFor(totals.accountsEngaged, 107),
    watchMinutes: metricSeriesFor(totals.watchMinutes, 108),
    audienceCount: snapshotSeries(
      base,
      30,
      spec.headlineValue,
      spec.audienceChange,
      spec.seed + 109,
    ),
    followingCount:
      spec.current.following === null
        ? []
        : snapshotSeries(base, 30, spec.current.following, 2, spec.seed + 110),
    contentCount:
      spec.current.content === null
        ? []
        : snapshotSeries(base, 30, spec.current.content, 6, spec.seed + 111),
    lifetimeViews:
      spec.current.lifetimeViews === null
        ? []
        : snapshotSeries(
            base,
            30,
            spec.current.lifetimeViews,
            spec.trendTotal30,
            spec.seed + 112,
          ),
    lifetimeLikes:
      spec.current.lifetimeLikes === null
        ? []
        : snapshotSeries(
            base,
            30,
            spec.current.lifetimeLikes,
            totals.likes ?? 0,
            spec.seed + 113,
          ),
  };
  return series;
}

function buildContentItems(
  spec: DemoPlatformSpec,
  base: Date,
): SocialContentItem[] {
  return spec.content.map((item, index) => ({
    contentId: `${spec.platform}-demo-${index + 1}`,
    title: item.title,
    contentType: spec.platform === "youtube" ? "video" : "post",
    publishedAt: new Date(
      base.getTime() - (4 + index * 9) * 86_400_000,
    ).toISOString(),
    capturedOn: isoDay(base, 1),
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    shares: item.shares,
    saves: Math.round(item.likes * 0.14),
    reach: spec.platform === "instagram" ? Math.round(item.views * 1.2) : null,
    averageViewDurationSeconds:
      spec.periodTotals.averageViewDurationSeconds !== null
        ? spec.periodTotals.averageViewDurationSeconds + index * 9
        : null,
  }));
}

function buildPlatform(
  spec: DemoPlatformSpec,
  base: Date,
  nowIso: string,
): { metrics: SocialPlatformMetrics; extended: SocialTrendPoint[] } {
  // The 90-day series is generated first; the 30-day window is its tail, so
  // switching chart timeframes stays perfectly consistent.
  const extended = trendingDailySeries(
    base,
    90,
    Math.round(spec.trendTotal30 * 2.45),
    spec.seed,
  );
  const tail = extended.slice(-30);
  const tailSum = tail.reduce((sum, point) => sum + point.value, 0);
  const trendSeries30 = scaledSeries(tail, spec.trendTotal30 / tailSum);
  // Keep the 90-day overlay byte-identical to the 30-day window it contains.
  extended.splice(-30, 30, ...trendSeries30);

  const values = trendSeries30.map((point) => point.value);
  const dailyGains = trendingDailySeries(
    base,
    30,
    spec.audienceChange,
    spec.seed + 7,
  );
  const gainValues = dailyGains.map((point) => point.value);
  const latestChange = gainValues.at(-1) ?? null;
  const average7d =
    Math.round(
      (gainValues.slice(-7).reduce((sum, value) => sum + value, 0) / 7) * 10,
    ) / 10;
  const average30d =
    Math.round(
      (gainValues.reduce((sum, value) => sum + value, 0) / 30) * 10,
    ) / 10;

  const evidence = Object.fromEntries(
    SOCIAL_PERIOD_METRIC_KEYS.map((key) => [
      key,
      spec.periodTotals[key as SocialPeriodMetricKey] !== null
        ? { latestMetricDate: isoDay(base, 1), observedDayCount: 30 }
        : { latestMetricDate: null, observedDayCount: null },
    ]),
  ) as SocialPlatformMetrics["periodEvidence"];

  const lastSyncedAt = new Date(base.getTime() - 14 * 60_000).toISOString();

  const metrics: SocialPlatformMetrics = {
    platform: spec.platform,
    status: "ready",
    headlineLabel: spec.headlineLabel,
    headlineValue: spec.headlineValue,
    headlinePrecision: "exact",
    lastSyncedAt,
    sourceDataAsOf: new Date(base.getTime() - 2 * 3_600_000).toISOString(),
    current: spec.current,
    trend: {
      daysRequested: 30,
      metric: spec.trendMetric,
      series: trendSeries30,
      peak: Math.max(...values),
      rangeMin: Math.min(...values),
      rangeMax: Math.max(...values),
      audienceVelocityPerDay:
        Math.round((spec.audienceChange / 30) * 10) / 10,
      audienceChange: spec.audienceChange,
      audienceChangeKind: spec.audienceChangeKind,
    },
    dailyAudience: {
      series: dailyGains,
      latestChange,
      latestChangeDate: isoDay(base, 1),
      average7d,
      average30d,
      versus7dAverage:
        latestChange === null
          ? null
          : Math.round((latestChange - average7d) * 10) / 10,
      signal: "above_average",
      observedDays: 30,
      observedPrior7d: 7,
      observedPrior30d: 30,
    },
    content: {
      latestCapturedOn: isoDay(base, 1),
      observedItemCount: spec.content.length,
      items: buildContentItems(spec, base),
    },
    periodTotals: spec.periodTotals,
    periodEvidence: evidence,
    periodSeries: buildPeriodSeries(spec, base, trendSeries30),
  };
  void nowIso;
  return { metrics, extended };
}

/** The filled dashboard store: three healthy, climbing demo channels. */
export function demoSocialDashboardMetrics(
  nowIso: string,
): SocialDashboardMetrics {
  const base = new Date(nowIso);
  return {
    generatedAt: nowIso,
    platforms: Object.fromEntries(
      DEMO_PLATFORMS.map((spec) => [
        spec.platform,
        buildPlatform(spec, base, nowIso).metrics,
      ]),
    ) as Record<SocialPlatformId, SocialPlatformMetrics>,
  };
}

/** 90-day trend series per platform, for the interactive chart timeframes. */
export function demoSocialExtendedSeries(
  nowIso: string,
): Record<SocialPlatformId, SocialTrendPoint[]> {
  const base = new Date(nowIso);
  return Object.fromEntries(
    DEMO_PLATFORMS.map((spec) => [
      spec.platform,
      buildPlatform(spec, base, nowIso).extended,
    ]),
  ) as Record<SocialPlatformId, SocialTrendPoint[]>;
}
