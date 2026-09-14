/**
 * The Analytics Hub's honest view model.
 *
 * The hub renders the design-lab layout (approved from a screenshot) with the
 * real synced store behind every panel that actually has data. This module is
 * the one place that decides, per panel, whether the store can back it:
 *
 * - a platform with stored evidence renders REAL numbers under a SYNCED STORE
 *   chip, with observed-day evidence instead of invented deltas;
 * - a platform with nothing in the store keeps the design-lab fixture column
 *   under the lab's own FIXTURE SNAPSHOT chip;
 * - a live-labeled panel never contains a fixture number, and a fixture
 *   number never appears outside a FIXTURE SNAPSHOT panel.
 *
 * Pure on purpose, so every one of those rules is unit-testable.
 */

import {
  HUB_PLATFORMS,
  HUB_TOP_CONTENT,
  HUB_TOTALS,
  RETENTION_CLIFF,
  RETENTION_FLOW,
  RETENTION_META,
  type HubPlatform,
} from "@/app/design-lab/fixtures";

import {
  SOCIAL_PLATFORM_IDS,
  type SocialDashboardMetrics,
  type SocialPeriodMetricKey,
  type SocialPeriodSeriesKey,
  type SocialPlatformId,
  type SocialPlatformMetrics,
  type SocialTrendPoint,
} from "./social-metrics";
import { platformStatusNote } from "./social-headline-deltas";

export type HubSource = "live" | "fixture";
export type HubRowTone = "positive" | "negative" | "neutral";

/** The chip wording every panel header carries. Pinned by tests. */
export const HUB_SOURCE_CHIPS: Record<HubSource, string> = {
  live: "SYNCED STORE",
  fixture: "FIXTURE SNAPSHOT",
};

export interface HubMetricRowModel {
  label: string;
  /** Formatted value, or "—" when the store has none. */
  value: string;
  /** Right-hand note: real evidence ("24/30D OBSERVED") or the fixture delta. */
  note: string;
  tone: HubRowTone;
  /** Sparkline values; empty means the AWAITING HISTORY treatment. */
  series: readonly number[];
}

export interface HubContentCardModel {
  title: string;
  views: string;
  likes: string;
  comments: string;
}

export interface HubHeroChipModel {
  id: SocialPlatformId;
  code: string;
  rgb: string;
  text: string;
}

export interface HubOverlaySeriesModel {
  id: SocialPlatformId;
  code: string;
  label: string;
  rgb: string;
  /** Raw values to normalize per-series; empty means awaiting history. */
  values: readonly number[];
}

export interface HubPlatformColumnModel {
  id: SocialPlatformId;
  label: string;
  code: string;
  rgb: string;
  source: HubSource;
  audienceLabel: string;
  audience: string;
  audienceDelta: string | null;
  audienceTone: HubRowTone;
  /** Honest status line for a live column (stale sync, etc.); null when clean. */
  statusNote: string | null;
  metrics: HubMetricRowModel[];
  /** Daily series for the interactive chart; live columns only. */
  chartSeries: readonly SocialTrendPoint[];
  chartMetricLabel: string;
}

export interface HubTopContentColumnModel {
  id: SocialPlatformId;
  code: string;
  label: string;
  rgb: string;
  items: HubContentCardModel[];
  /** Why a live-mode column shows no cards; null when it has cards. */
  emptyNote: string | null;
}

export interface AnalyticsHubModel {
  /** How many of the three platforms have real stored evidence. */
  syncedCount: number;
  hero: {
    source: HubSource;
    total: string;
    totalNote: string;
    /** Combined audience snapshots; live mode only, else empty. */
    combinedSeries: readonly SocialTrendPoint[];
    /** Fixture hero trend values; fixture mode only, else empty. */
    fixtureSeries: readonly number[];
    fixtureWindow: string;
    chips: HubHeroChipModel[];
  };
  platforms: HubPlatformColumnModel[];
  topContent: {
    source: HubSource;
    columns: HubTopContentColumnModel[];
  };
  overlay: {
    source: HubSource;
    series: HubOverlaySeriesModel[];
    note: string;
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatCount(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(Math.round(value));
}

function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0
    ? `+${NUMBER_FORMAT.format(rounded)}`
    : NUMBER_FORMAT.format(rounded);
}

function formatWatchHours(minutes: number | null): string {
  return minutes === null
    ? "—"
    : `${NUMBER_FORMAT.format(Math.round(minutes / 60))} H`;
}

function toneOf(value: number): HubRowTone {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

const fixtureById = new Map<SocialPlatformId, HubPlatform>(
  HUB_PLATFORMS.map((platform) => [platform.id, platform]),
);

function fixtureFor(platform: SocialPlatformId): HubPlatform {
  const fixture = fixtureById.get(platform);
  if (!fixture) throw new Error(`No hub fixture for ${platform}`);
  return fixture;
}

/**
 * A platform is synced when the store holds any real evidence for it. Status
 * alone is not enough: a "ready" row with nothing stored still has nothing to
 * show, and a stale-but-stored series is still real data worth rendering.
 */
export function isPlatformSynced(platform: SocialPlatformMetrics): boolean {
  return (
    platform.headlineValue !== null ||
    platform.trend.series.length > 0 ||
    platform.content.items.length > 0
  );
}

/**
 * Sum audience snapshots across platforms, only on dates where every
 * reporting platform has a snapshot — a partial sum would silently present a
 * smaller total as a real combined figure.
 */
export function combineAudienceSeries(
  seriesList: readonly (readonly SocialTrendPoint[])[],
): SocialTrendPoint[] {
  const reporting = seriesList.filter((series) => series.length > 0);
  if (reporting.length === 0) return [];
  const maps = reporting.map(
    (series) => new Map(series.map((point) => [point.date, point.value])),
  );
  return [...maps[0].keys()]
    .filter((date) => maps.every((map) => map.has(date)))
    .sort()
    .map((date) => ({
      date,
      value: maps.reduce((total, map) => total + (map.get(date) ?? 0), 0),
    }));
}

interface LiveMetricPlanRow {
  label: string;
  totals: SocialPeriodMetricKey;
  series: SocialPeriodSeriesKey | null;
  format?: (value: number | null) => string;
}

/**
 * Which stored 30-day totals each live column reads, top to bottom. Only
 * metrics the store actually captures for that platform are listed; the note
 * column carries the stored observed-day evidence, never an invented delta.
 */
const LIVE_METRIC_PLAN: Record<SocialPlatformId, LiveMetricPlanRow[]> = {
  youtube: [
    { label: "30D VIEWS", totals: "views", series: "views" },
    {
      label: "WATCH TIME",
      totals: "watchMinutes",
      series: "watchMinutes",
      format: formatWatchHours,
    },
    { label: "LIKES", totals: "likes", series: "likes" },
    { label: "COMMENTS", totals: "comments", series: "comments" },
  ],
  instagram: [
    { label: "30D REACH", totals: "reach", series: "reach" },
    { label: "INTERACTIONS", totals: "interactions", series: "interactions" },
    { label: "LIKES", totals: "likes", series: "likes" },
    { label: "PROFILE VIEWS", totals: "profileViews", series: null },
  ],
  tiktok: [
    { label: "30D VIEWS", totals: "views", series: "views" },
    { label: "LIKES", totals: "likes", series: "likes" },
    { label: "COMMENTS", totals: "comments", series: "comments" },
    { label: "SHARES", totals: "shares", series: "shares" },
  ],
};

/**
 * The stored evidence for a 30-day total, as the note column renders it:
 * observed-day counts when the store kept them, "30D TOTAL" for a bare
 * total, "NOT REPORTED" when the store has nothing. Never an invented delta.
 */
function periodEvidenceNote(
  platform: SocialPlatformMetrics,
  key: SocialPeriodMetricKey,
): string {
  const evidence = platform.periodEvidence[key];
  return evidence.observedDayCount !== null
    ? `${evidence.observedDayCount}/30D OBSERVED`
    : platform.periodTotals[key] !== null
      ? "30D TOTAL"
      : "NOT REPORTED";
}

function liveMetricRows(platform: SocialPlatformMetrics): HubMetricRowModel[] {
  return LIVE_METRIC_PLAN[platform.platform].map((plan) => {
    const total = platform.periodTotals[plan.totals];
    const points = plan.series
      ? (platform.periodSeries?.[plan.series] ?? [])
      : [];
    const series =
      points.length >= 2 ? points.map((point) => point.value) : [];
    const note = periodEvidenceNote(platform, plan.totals);
    return {
      label: plan.label,
      value: (plan.format ?? formatCount)(total),
      note,
      tone: "neutral",
      series,
    };
  });
}

function fixtureMetricRows(fixture: HubPlatform): HubMetricRowModel[] {
  return fixture.metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    note: metric.delta,
    tone: metric.tone,
    series: metric.series,
  }));
}

function chartMetricLabel(platform: SocialPlatformMetrics): string {
  if (platform.trend.metric === "views") return "DAILY VIEWS";
  if (platform.trend.metric === "reach") return "DAILY REACH";
  if (platform.trend.metric === "audience_count") return "FOLLOWER SNAPSHOTS";
  return platform.platform === "youtube"
    ? "DAILY VIEWS"
    : platform.platform === "instagram"
      ? "DAILY REACH"
      : "FOLLOWER SNAPSHOTS";
}

function audienceDeltaFor(
  platform: SocialPlatformMetrics,
): { text: string | null; tone: HubRowTone } {
  const change = platform.trend.audienceChange;
  if (change === null) return { text: null, tone: "neutral" };
  return { text: `${formatSigned(change)} · 30D`, tone: toneOf(change) };
}

function liveContentCards(
  platform: SocialPlatformMetrics,
): HubContentCardModel[] {
  return [...platform.content.items]
    .sort((left, right) => (right.views ?? -1) - (left.views ?? -1))
    .slice(0, 3)
    .map((item) => ({
      title: item.title ?? item.contentId,
      views: formatCount(item.views),
      likes: formatCount(item.likes),
      comments: formatCount(item.comments),
    }));
}

export function buildAnalyticsHubModel(
  metrics: SocialDashboardMetrics,
  extendedSeries: Partial<
    Record<SocialPlatformId, SocialTrendPoint[]>
  > | null = null,
): AnalyticsHubModel {
  const synced = SOCIAL_PLATFORM_IDS.filter((id) =>
    isPlatformSynced(metrics.platforms[id]),
  );
  const anyLive = synced.length > 0;

  const platforms: HubPlatformColumnModel[] = SOCIAL_PLATFORM_IDS.map((id) => {
    const platform = metrics.platforms[id];
    const fixture = fixtureFor(id);
    if (!isPlatformSynced(platform)) {
      return {
        id,
        label: fixture.label,
        code: fixture.code,
        rgb: fixture.rgb,
        source: "fixture",
        audienceLabel: fixture.audienceLabel,
        audience: fixture.audience,
        audienceDelta: fixture.audienceDelta,
        audienceTone: "positive",
        statusNote: null,
        metrics: fixtureMetricRows(fixture),
        chartSeries: [],
        chartMetricLabel: "",
      };
    }
    const delta = audienceDeltaFor(platform);
    const extended = extendedSeries?.[id] ?? [];
    const base = platform.trend.series;
    return {
      id,
      label: fixture.label,
      code: fixture.code,
      rgb: fixture.rgb,
      source: "live",
      audienceLabel: platform.headlineLabel.toUpperCase(),
      audience: formatCount(platform.headlineValue),
      audienceDelta: delta.text,
      audienceTone: delta.tone,
      statusNote: platformStatusNote(platform),
      metrics: liveMetricRows(platform),
      chartSeries: extended.length >= base.length ? extended : base,
      chartMetricLabel: chartMetricLabel(platform),
    };
  });

  const liveWithAudience = synced.filter(
    (id) => metrics.platforms[id].headlineValue !== null,
  );
  const total = liveWithAudience.reduce(
    (sum, id) => sum + (metrics.platforms[id].headlineValue ?? 0),
    0,
  );
  const hero: AnalyticsHubModel["hero"] = anyLive
    ? {
        source: "live",
        total: liveWithAudience.length > 0 ? formatCount(total) : "—",
        totalNote:
          liveWithAudience.length > 0
            ? `LIVE · ${liveWithAudience
                .map((id) => fixtureFor(id).code)
                .join(" + ")}`
            : "SYNCED · AWAITING AUDIENCE",
        combinedSeries: combineAudienceSeries(
          liveWithAudience.map(
            (id) => metrics.platforms[id].periodSeries?.audienceCount ?? [],
          ),
        ),
        fixtureSeries: [],
        fixtureWindow: "",
        chips: SOCIAL_PLATFORM_IDS.map((id) => {
          const fixture = fixtureFor(id);
          const platform = metrics.platforms[id];
          const chipText = !isPlatformSynced(platform)
            ? "NOT SYNCED"
            : (audienceDeltaFor(platform).text ?? "Δ AWAITING");
          return { id, code: fixture.code, rgb: fixture.rgb, text: chipText };
        }),
      }
    : {
        source: "fixture",
        total: HUB_TOTALS.audience,
        totalNote: HUB_TOTALS.delta,
        combinedSeries: [],
        fixtureSeries: HUB_TOTALS.series,
        fixtureWindow: HUB_TOTALS.window,
        chips: HUB_PLATFORMS.map((fixture) => ({
          id: fixture.id,
          code: fixture.code,
          rgb: fixture.rgb,
          text: fixture.audienceDelta,
        })),
      };

  const topContent: AnalyticsHubModel["topContent"] = {
    source: anyLive ? "live" : "fixture",
    columns: SOCIAL_PLATFORM_IDS.map((id) => {
      const fixture = fixtureFor(id);
      const platform = metrics.platforms[id];
      if (!anyLive) {
        return {
          id,
          code: fixture.code,
          label: fixture.label,
          rgb: fixture.rgb,
          items: HUB_TOP_CONTENT.filter((item) => item.platform === id).map(
            (item) => ({
              title: item.title,
              views: item.views,
              likes: item.likes,
              comments: item.comments,
            }),
          ),
          emptyNote: null,
        };
      }
      // Live mode: an unsynced platform's column states its state instead of
      // borrowing fixture cards into a SYNCED STORE panel.
      if (!isPlatformSynced(platform)) {
        return {
          id,
          code: fixture.code,
          label: fixture.label,
          rgb: fixture.rgb,
          items: [],
          emptyNote: "NOT SYNCED",
        };
      }
      const items = liveContentCards(platform);
      return {
        id,
        code: fixture.code,
        label: fixture.label,
        rgb: fixture.rgb,
        items,
        emptyNote: items.length > 0 ? null : "AWAITING CAPTURE",
      };
    }),
  };

  const overlay: AnalyticsHubModel["overlay"] = anyLive
    ? {
        source: "live",
        series: SOCIAL_PLATFORM_IDS.map((id) => {
          const fixture = fixtureFor(id);
          const platform = metrics.platforms[id];
          const snapshots = isPlatformSynced(platform)
            ? (platform.periodSeries?.audienceCount ?? [])
            : [];
          return {
            id,
            code: fixture.code,
            label: fixture.label,
            rgb: fixture.rgb,
            values:
              snapshots.length >= 2
                ? snapshots.map((point) => point.value)
                : [],
          };
        }),
        note: "AUDIENCE SNAPSHOTS · EACH SERIES SCALED TO ITS OWN 30D RANGE",
      }
    : {
        source: "fixture",
        series: HUB_PLATFORMS.map((fixture) => ({
          id: fixture.id,
          code: fixture.code,
          label: fixture.label,
          rgb: fixture.rgb,
          values: fixture.series30,
        })),
        note: "EACH SERIES SCALED TO ITS OWN 30D RANGE",
      };

  return { syncedCount: synced.length, hero, platforms, topContent, overlay };
}

/* -- retention theatre -------------------------------------------------------
 *
 * Design-lab section 20 promoted into the hub, with the lane's honesty rule
 * as the model: the per-second retention curve and the exit-density bins do
 * not exist in the store today, so those instruments always render the lab's
 * fixture series under the lab's own FIXTURE SERIES chip, and their insights
 * only say what they WOULD show. The headline strip and the subscriber-flow
 * band read the real YouTube 30-day totals wherever the store holds them; a
 * stage the store cannot back renders the awaiting treatment, never a fixture
 * number inside a SYNCED STORE panel.
 */

/** Per-panel chip wording: live keeps the hub's chip, fixture keeps the lab's. */
export const RETENTION_SOURCE_CHIPS: Record<HubSource, string> = {
  live: HUB_SOURCE_CHIPS.live,
  fixture: "FIXTURE SERIES",
};

export type RetentionStageState = "live" | "fixture" | "awaiting";

export interface RetentionHeadlineStatModel {
  label: string;
  /** Formatted figure, or "—" when a synced store has not reported it. */
  value: string;
  /** Evidence for a live figure; the fixture framing for a fixture one. */
  detail: string;
}

export interface RetentionFlowStageModel {
  id: string;
  label: string;
  value: string;
  note: string;
  state: RetentionStageState;
  /** Band height as a share of the views stage, 0–100; null draws no bar. */
  share: number | null;
}

export interface RetentionTheatreModel {
  headline: {
    source: HubSource;
    /** "YOUTUBE · 30D WINDOW" live; the fixture video framing otherwise. */
    context: string;
    stats: RetentionHeadlineStatModel[];
  };
  /** The per-second curve is not in the store; always the labeled fixture. */
  curve: {
    source: "fixture";
    /** Fixture-video framing shown when the headline went live; else null. */
    context: string | null;
    insight: string;
  };
  /** Exit bins are not in the store either; always the labeled fixture. */
  exits: { source: "fixture"; insight: string };
  flow: {
    source: HubSource;
    stages: RetentionFlowStageModel[];
    insight: string;
  };
  /** The honest footer line naming exactly which instruments await real data. */
  awaiting: string;
}

/** "m:ss" for a duration in seconds (fractional seconds round). */
export function formatRetentionClock(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function retentionShareOf(
  value: number | null,
  views: number | null,
): number | null {
  if (value === null || views === null || views <= 0) return null;
  return Math.max(0, Math.min(100, (value / views) * 100));
}

function awaitingStage(
  id: string,
  label: string,
  note: string,
): RetentionFlowStageModel {
  return { id, label, value: "—", note, state: "awaiting", share: null };
}

function liveFlowStages(
  youtube: SocialPlatformMetrics,
): RetentionFlowStageModel[] {
  const totals = youtube.periodTotals;
  const views = totals.views;
  const engaged =
    totals.likes !== null && totals.comments !== null
      ? totals.likes + totals.comments + (totals.shares ?? 0)
      : null;
  const engagedNote =
    totals.shares !== null
      ? "LIKES + COMMENTS + SHARES · 30D"
      : "LIKES + COMMENTS · 30D";
  const gained = totals.audienceGained;
  const netChange =
    youtube.trend.audienceChangeKind === "net_subscribers"
      ? youtube.trend.audienceChange
      : null;

  return [
    views !== null
      ? {
          id: "views",
          label: "30D VIEWS",
          value: formatCount(views),
          note: periodEvidenceNote(youtube, "views"),
          state: "live",
          share: 100,
        }
      : awaitingStage("views", "30D VIEWS", "NOT REPORTED"),
    // The stage between views and engagement is exactly the per-video
    // retention data the store does not hold yet — an honest gap, no bar.
    awaitingStage(
      "past-cliff",
      "PAST THE CLIFF",
      "AWAITING PER-VIDEO RETENTION SYNC",
    ),
    engaged !== null
      ? {
          id: "engaged",
          label: "ENGAGED",
          value: formatCount(engaged),
          note: engagedNote,
          state: "live",
          share: retentionShareOf(engaged, views),
        }
      : awaitingStage("engaged", "ENGAGED", "AWAITING ENGAGEMENT TOTALS"),
    gained !== null
      ? {
          id: "subscribed",
          label: "SUBSCRIBED",
          value: `+${formatCount(gained)}`,
          note:
            totals.audienceLost !== null
              ? `-${formatCount(totals.audienceLost)} UNSUBSCRIBED SAME WINDOW`
              : periodEvidenceNote(youtube, "audienceGained"),
          state: "live",
          share: retentionShareOf(gained, views),
        }
      : netChange !== null
        ? {
            id: "subscribed",
            label: "SUBSCRIBED",
            value: formatSigned(netChange),
            note: "NET SUBSCRIBERS · 30D",
            state: "live",
            share: retentionShareOf(Math.max(0, netChange), views),
          }
        : awaitingStage("subscribed", "SUBSCRIBED", "AWAITING SUBSCRIBER TOTALS"),
  ];
}

export function buildRetentionTheatreModel(
  metrics: SocialDashboardMetrics,
): RetentionTheatreModel {
  const youtube = metrics.platforms.youtube;
  const live = isPlatformSynced(youtube);
  const fixtureVideo = `“${RETENTION_META.video.toUpperCase()}” · ${RETENTION_META.views} VIEWS`;

  const headline: RetentionTheatreModel["headline"] = live
    ? {
        source: "live",
        context: "YOUTUBE · 30D WINDOW",
        stats: [
          {
            label: "30D VIEWS",
            value: formatCount(youtube.periodTotals.views),
            detail: periodEvidenceNote(youtube, "views"),
          },
          {
            label: "AVG VIEW DURATION",
            value:
              youtube.periodTotals.averageViewDurationSeconds !== null
                ? formatRetentionClock(
                    youtube.periodTotals.averageViewDurationSeconds,
                  )
                : "—",
            detail: periodEvidenceNote(youtube, "averageViewDurationSeconds"),
          },
        ],
      }
    : {
        source: "fixture",
        context: fixtureVideo,
        stats: [
          {
            label: "AVG WATCHED",
            value: RETENTION_META.avgWatched,
            detail: `${RETENTION_META.avgWatchedTime} OF ${RETENTION_META.duration}`,
          },
        ],
      };

  // The curve and the bins stay fixture until per-video retention sync lands;
  // their insights claim only what the instrument WOULD show, as the lab does.
  const curve: RetentionTheatreModel["curve"] = {
    source: "fixture",
    context: live ? `${fixtureVideo} · FIXTURE` : null,
    insight: `Would show: the video does not fade — it breaks. On the fixture shape retention falls ${RETENTION_CLIFF.from} → ${RETENTION_CLIFF.to} in the twenty seconds after ${formatRetentionClock(RETENTION_CLIFF.t)}; the real cut arrives with per-video retention sync.`,
  };
  const exits: RetentionTheatreModel["exits"] = {
    source: "fixture",
    insight:
      "Would show: where exits pile up against the video's beats — on the fixture bins the CLIFF bins, not the outro, hold the lost watch time.",
  };

  const stages = live
    ? liveFlowStages(youtube)
    : RETENTION_FLOW.map(
        (stage): RetentionFlowStageModel => ({
          id: stage.id,
          label: stage.label,
          value: stage.value,
          note: stage.note,
          state: "fixture",
          share: stage.share,
        }),
      );
  const measured = stages.filter((stage) => stage.state === "live");
  const flow: RetentionTheatreModel["flow"] = {
    source: live ? "live" : "fixture",
    stages,
    insight: live
      ? measured.length > 0
        ? `Insight: measured stages only — ${measured
            .map((stage) => `${stage.label} ${stage.value}`)
            .join(" → ")}; the past-the-cliff stage stays unmeasured until per-video retention sync lands.`
        : "Insight: no funnel stage is measured yet — the band lights up as the store's 30D totals land."
      : "Would show: subscribers live downstream of the cliff — the fixture band thins 100 → 26 before anyone can subscribe, so minute two is worth more than any end-screen.",
  };

  const awaiting = live
    ? "AWAITING REAL DATA · RETENTION CURVE AND EXIT DENSITY ARRIVE WHEN PER-VIDEO RETENTION SYNC LANDS · THE PAST-THE-CLIFF FLOW STAGE LANDS WITH THAT SAME SYNC"
    : "AWAITING REAL DATA · RETENTION CURVE AND EXIT DENSITY ARRIVE WHEN PER-VIDEO RETENTION SYNC LANDS · HEADLINE AND SUBSCRIBER FLOW SWITCH TO THE STORE WHEN YOUTUBE SYNCS";

  return { headline, curve, exits, flow, awaiting };
}
