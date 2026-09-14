/**
 * The simplified person-progress view behind each dashboard progress frame.
 *
 * The governing rule is that an absent number stays absent. A series is either
 * drawn from real connected measurements or it is not drawn at all — it keeps
 * its legend entry and states why it is missing. There is no interpolation, no
 * zero-filling, and no carrying a stale value forward to make a line continue.
 *
 * Three consequences worth stating, because they are easy to get wrong:
 *
 *  - A single measurement is not a trend. `buildMetricSeries` demotes one point
 *    to `insufficient_history` so a lone reading cannot imply a direction.
 *  - Series with different units never share a numerical scale. Each is its own
 *    track with its own range, synchronized only on the date axis.
 *  - Body composition has no connected source, so every one of those variables
 *    reports N/A rather than a plausible-looking number.
 */

import type { Person } from "@/lib/whoop/contract";
import type {
  SocialDashboardMetrics,
  SocialPlatformId,
} from "./social-metrics";
import type { WhoopConnection, WhoopMetricHistoryPoint } from "@/lib/whoop/contract";

/** Why a series has no line. Every reason is shown to the operator verbatim. */
export type MetricUnavailableReason =
  | "not_connected"
  | "insufficient_history"
  | "non_consecutive"
  | "no_source";

export const METRIC_UNAVAILABLE_LABELS: Readonly<
  Record<MetricUnavailableReason, string>
> = {
  not_connected: "NOT CONNECTED",
  insufficient_history: "INSUFFICIENT HISTORY",
  non_consecutive: "NO CONTINUOUS RUN",
  no_source: "N/A",
};

export const METRIC_UNAVAILABLE_DETAIL: Readonly<
  Record<MetricUnavailableReason, string>
> = {
  not_connected:
    "No connected source supplies this measurement for this person.",
  insufficient_history:
    "Only one measurement exists. A single reading is a value, not a trend, so no line is drawn.",
  non_consecutive:
    "Every measurement stands alone on its own day. Joining them would draw changes across days that were never measured, so the readings are listed instead of plotted.",
  no_source:
    "Nothing in ROWZY measures this yet. It is listed so its absence is visible rather than silently dropped.",
};

const DAY_MS = 86_400_000;

/**
 * Split a series into runs of consecutive days.
 *
 * A gap in the data becomes a gap in the line. Joining across it would draw a
 * change that was never measured. Shared with the renderer so the decision of
 * what is drawable is made once.
 */
export function contiguousRuns(
  points: readonly ProgressPoint[],
): ProgressPoint[][] {
  const runs: ProgressPoint[][] = [];
  let run: ProgressPoint[] = [];
  let previous: number | null = null;
  for (const point of points) {
    const time = Date.parse(`${point.date}T00:00:00.000Z`);
    if (previous !== null && time - previous > DAY_MS * 1.5) {
      if (run.length) runs.push(run);
      run = [];
    }
    run.push(point);
    previous = time;
  }
  if (run.length) runs.push(run);
  return runs;
}

export interface ProgressPoint {
  /** ISO date (YYYY-MM-DD) of the measurement. */
  date: string;
  value: number;
}

export interface ProgressMetricSeries {
  id: string;
  label: string;
  unit: string;
  /** The named origin of the numbers, shown next to the chart. */
  source: string;
  /** Points actually measured. Never padded and never interpolated. */
  points: ProgressPoint[];
  /** Null when the series is drawable; otherwise why it is not. */
  unavailable: MetricUnavailableReason | null;
  /**
   * The single most recent measurement, even when there is too little history
   * to draw. This is how one real reading is shown honestly.
   */
  latest: ProgressPoint | null;
}

/**
 * Build one series.
 *
 * `noSource` short-circuits everything: a metric nothing measures must never
 * borrow points from somewhere else.
 */
export function buildMetricSeries(input: {
  id: string;
  label: string;
  unit: string;
  source: string;
  points?: readonly ProgressPoint[];
  noSource?: boolean;
  notConnected?: boolean;
}): ProgressMetricSeries {
  const base = {
    id: input.id,
    label: input.label,
    unit: input.unit,
    source: input.source,
  };
  if (input.noSource) {
    return { ...base, points: [], unavailable: "no_source", latest: null };
  }
  const points = (input.points ?? [])
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/u.test(point.date) && Number.isFinite(point.value),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = points.at(-1) ?? null;

  if (input.notConnected || points.length === 0) {
    return { ...base, points: [], unavailable: "not_connected", latest: null };
  }
  if (points.length < 2) {
    // One reading is real and worth showing, but it is not a trend.
    return {
      ...base,
      points: [],
      unavailable: "insufficient_history",
      latest,
    };
  }
  // Several readings that never fall on consecutive days cannot form a line
  // either. Four isolated workout days are four facts, not a trajectory.
  if (!contiguousRuns(points).some((run) => run.length >= 2)) {
    return { ...base, points, unavailable: "non_consecutive", latest };
  }
  return { ...base, points, unavailable: null, latest };
}

/* -- headline readouts ---------------------------------------------------- */

export interface ProgressHeadline {
  id: string;
  label: string;
  /** Null renders as N/A. It is never replaced by a placeholder number. */
  value: number | null;
  unit: string;
  /** How the value should be rendered, e.g. "7:12" for a duration. */
  display: string | null;
  /** ISO timestamp the value was verified at, or null when unverified. */
  verifiedAt: string | null;
  source: string;
}

/* -- photos -------------------------------------------------------------- */

export interface PhotoTimelineItem {
  id: string;
  /** A URL the browser may load. Never a storage path or object key. */
  src: string | null;
  /** ISO date when the photo was captured, or null when not recorded. */
  capturedAt: string | null;
  label: string;
  /** Where this image came from, shown under the frame. */
  source: string;
  width: number;
  height: number;
  /** The operator's own private note for this capture, when one exists. */
  note: string | null;
  /** A verified weight recorded against this capture's date. */
  weightKilograms: number | null;
  /** True when the image itself is withheld and only its metadata is shown. */
  hidden: boolean;
}

export interface PhotoTimeline {
  items: PhotoTimelineItem[];
  /** Null when the timeline is complete; otherwise why it is not. */
  unavailable: string | null;
}

/** The two-photo comparison: the earliest and latest captures held together. */
export interface PhotoComparison {
  earlier: PhotoTimelineItem | null;
  latest: PhotoTimelineItem | null;
}

export function buildPhotoComparison(timeline: PhotoTimeline): PhotoComparison {
  const dated = timeline.items
    .filter((item) => item.capturedAt !== null)
    .sort((left, right) =>
      (left.capturedAt ?? "").localeCompare(right.capturedAt ?? ""),
    );
  // A comparison needs two distinct captures. One photo is shown on its own
  // rather than being compared with itself.
  if (dated.length < 2) {
    return { earlier: null, latest: dated.at(-1) ?? timeline.items[0] ?? null };
  }
  return { earlier: dated[0], latest: dated.at(-1) ?? null };
}

/* -- social -------------------------------------------------------------- */

export interface ProgressSocialSummary {
  platform: SocialPlatformId;
  label: string;
  headlineLabel: string;
  headlineValue: number | null;
  /** `exact`, `rounded` or `unknown` — never presented as exact when rounded. */
  precision: string;
  changeLabel: string;
  changeValue: number | null;
  status: string;
  connected: boolean;
  lastSyncedAt: string | null;
  sourceDataAsOf: string | null;
}

const PLATFORM_LABELS: Readonly<Record<SocialPlatformId, string>> = {
  youtube: "YOUTUBE",
  instagram: "INSTAGRAM",
  tiktok: "TIKTOK",
};

const PLATFORM_STATUS_LABELS: Readonly<Record<string, string>> = {
  ready: "SYNCED",
  partial: "PARTIAL",
  credential_pending: "CREDENTIAL PENDING",
  not_connected: "NOT CONNECTED",
  error: "SYNC FAILED",
  unavailable: "UNAVAILABLE",
};

export function buildSocialSummaries(
  metrics: SocialDashboardMetrics,
): ProgressSocialSummary[] {
  return (Object.keys(PLATFORM_LABELS) as SocialPlatformId[]).map(
    (platform) => {
      const entry = metrics.platforms[platform];
      return {
        platform,
        label: PLATFORM_LABELS[platform],
        headlineLabel: entry.headlineLabel.toUpperCase(),
        headlineValue: entry.headlineValue,
        precision: entry.headlinePrecision,
        changeLabel: "VS 7-DAY AVERAGE",
        changeValue: entry.dailyAudience.versus7dAverage,
        status: PLATFORM_STATUS_LABELS[entry.status] ?? "UNAVAILABLE",
        connected: entry.status === "ready" || entry.status === "partial",
        lastSyncedAt: entry.lastSyncedAt,
        sourceDataAsOf: entry.sourceDataAsOf,
      };
    },
  );
}

/* -- known variables ------------------------------------------------------ */

export interface KnownVariable {
  group: string;
  label: string;
  /** The literal string shown. "N/A" when nothing measures this. */
  value: string;
  measured: boolean;
}

/* -- health --------------------------------------------------------------- */

function historyDate(point: WhoopMetricHistoryPoint): string | null {
  const parsed = Date.parse(point.recordedAt);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : null;
}

function seriesFromHistory(
  history: readonly WhoopMetricHistoryPoint[],
  read: (point: WhoopMetricHistoryPoint) => number | null | undefined,
): ProgressPoint[] {
  const points: ProgressPoint[] = [];
  for (const point of history) {
    const date = historyDate(point);
    const value = read(point);
    if (date !== null && typeof value === "number" && Number.isFinite(value)) {
      points.push({ date, value });
    }
  }
  return points;
}

/* -- the response --------------------------------------------------------- */

export interface PersonProgress {
  person: Person;
  /** The display name from the membership record, never client-supplied. */
  displayName: string;
  /** A short identity line, e.g. "ROWZY dashboard member". */
  identityLabel: string;
  /** True only when a live WHOOP connection backs the health figures. */
  verified: boolean;
  headline: ProgressHeadline[];
  photos: PhotoTimeline;
  comparison: PhotoComparison;
  social: ProgressSocialSummary[];
  /**
   * The signal timeline. Each entry is its own track with its own unit and
   * range; they share only the date axis. Units are never mixed on one scale.
   */
  timeline: ProgressMetricSeries[];
  knownVariables: KnownVariable[];
  lastSyncedAt: string | null;
  generatedAt: string | null;
}

export interface PersonProgressInput {
  person: Person;
  displayName: string;
  connection: WhoopConnection;
  socialMetrics: SocialDashboardMetrics;
  photos: PhotoTimeline;
  /**
   * The current body measurement, when WHOOP's body-measurement scope is
   * granted. WHOOP stores one current reading per identity rather than a
   * history, so this can only ever be a single point.
   */
  bodyMeasurement: { weightKilograms: number; syncedAt: string } | null;
  /** Dated weights recorded by the operator, when that store exists. */
  weightHistory?: readonly ProgressPoint[];
  /** Completed workouts, used only for a count within the retained window. */
  workoutDates?: readonly string[];
  generatedAt: string | null;
}

/**
 * Compose one person's simplified progress view.
 *
 * Social summaries are dashboard-wide rather than per-person: the connected
 * accounts belong to the shared channel, not to an individual, and pretending
 * otherwise would attribute one person's followers to the other.
 */
export function buildPersonProgress(
  input: PersonProgressInput,
): PersonProgress {
  const history = input.connection.metrics?.history ?? [];
  const metrics = input.connection.metrics ?? null;
  const connected =
    input.connection.status === "connected" ||
    input.connection.status === "syncing";

  // Weight: the operator's dated entries when that store exists, plus WHOOP's
  // single current reading. WHOOP keeps one row per identity rather than a
  // history, so on its own it can only ever be one point.
  const weightPoints: ProgressPoint[] = [...(input.weightHistory ?? [])];
  if (input.bodyMeasurement) {
    const parsed = Date.parse(input.bodyMeasurement.syncedAt);
    if (Number.isFinite(parsed)) {
      weightPoints.push({
        date: new Date(parsed).toISOString().slice(0, 10),
        value: input.bodyMeasurement.weightKilograms,
      });
    }
  }

  // Workouts per day, counted from completed workout dates within the window.
  const workoutsByDate = new Map<string, number>();
  for (const stamp of input.workoutDates ?? []) {
    const parsed = Date.parse(stamp);
    if (!Number.isFinite(parsed)) continue;
    const date = new Date(parsed).toISOString().slice(0, 10);
    workoutsByDate.set(date, (workoutsByDate.get(date) ?? 0) + 1);
  }
  const workoutPoints = [...workoutsByDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const sleepPoints = seriesFromHistory(
    history,
    (point) =>
      typeof point.sleepDurationMinutes === "number"
        ? point.sleepDurationMinutes / 60
        : null,
  );

  const timeline: ProgressMetricSeries[] = [
    buildMetricSeries({
      id: "weight",
      label: "WEIGHT",
      unit: "kg",
      source:
        input.weightHistory?.length
          ? "Verified weight entries"
          : "WHOOP body measurement",
      points: weightPoints,
      notConnected: weightPoints.length === 0,
    }),
    buildMetricSeries({
      id: "recovery",
      label: "RECOVERY",
      unit: "%",
      source: "WHOOP completed cycles",
      points: seriesFromHistory(history, (point) => point.recoveryScore),
      notConnected: !connected,
    }),
    buildMetricSeries({
      id: "sleep",
      label: "SLEEP",
      unit: "h",
      source: "WHOOP completed sleep",
      points: sleepPoints,
      notConnected: !connected,
    }),
    buildMetricSeries({
      id: "strain",
      label: "STRAIN",
      unit: "",
      source: "WHOOP completed cycles",
      points: seriesFromHistory(history, (point) => point.strain),
      notConnected: !connected,
    }),
    buildMetricSeries({
      id: "workouts",
      label: "WORKOUTS",
      unit: "",
      source: "WHOOP workouts",
      points: workoutPoints,
      notConnected: workoutPoints.length === 0,
    }),
  ];

  const latestWeight = weightPoints
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);

  const socialReach = buildSocialSummaries(input.socialMetrics);
  const totalAudience = socialReach.reduce<number | null>((total, platform) => {
    if (platform.headlineValue === null) return total;
    return (total ?? 0) + platform.headlineValue;
  }, null);

  const headline: ProgressHeadline[] = [
    {
      id: "weight",
      label: "WEIGHT",
      value: latestWeight?.value ?? null,
      unit: "kg",
      display: null,
      verifiedAt: latestWeight ? `${latestWeight.date}T00:00:00.000Z` : null,
      source: "WHOOP body measurement",
    },
    {
      id: "recovery",
      label: "RECOVERY",
      value: metrics?.recoveryScore ?? null,
      unit: "%",
      display: null,
      verifiedAt: input.connection.lastSyncedAt,
      source: "WHOOP completed cycles",
    },
    {
      id: "sleep",
      label: "SLEEP",
      value:
        typeof metrics?.sleepDurationMinutes === "number"
          ? metrics.sleepDurationMinutes / 60
          : null,
      unit: "hrs",
      display:
        typeof metrics?.sleepDurationMinutes === "number"
          ? `${Math.floor(metrics.sleepDurationMinutes / 60)}:${String(
              Math.round(metrics.sleepDurationMinutes % 60),
            ).padStart(2, "0")}`
          : null,
      verifiedAt: input.connection.lastSyncedAt,
      source: "WHOOP completed sleep",
    },
    {
      id: "strain",
      label: "STRAIN",
      value: metrics?.strain ?? null,
      unit: "",
      display: null,
      verifiedAt: input.connection.lastSyncedAt,
      source: "WHOOP completed cycles",
    },
    {
      id: "workouts",
      label: "WORKOUTS",
      value: workoutPoints.length === 0 ? null : workoutPoints.reduce(
        (total, point) => total + point.value,
        0,
      ),
      unit: "",
      display: null,
      verifiedAt: input.connection.lastSyncedAt,
      source: "WHOOP workouts",
    },
    {
      id: "social-reach",
      label: "SOCIAL REACH",
      value: totalAudience,
      unit: "",
      display: null,
      verifiedAt:
        socialReach
          .map((platform) => platform.lastSyncedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
      source: "Connected social accounts",
    },
  ];

  // Everything ROWZY does not measure. Listed rather than omitted, so the gap
  // is visible instead of looking like an oversight.
  const naVariable = (group: string, label: string): KnownVariable => ({
    group,
    label,
    value: "N/A",
    measured: false,
  });

  const knownVariables: KnownVariable[] = [
    {
      group: "SOURCE",
      label: "SOURCE",
      value: connected ? "WHOOP" : "NOT CONNECTED",
      measured: connected,
    },
    {
      group: "SOURCE",
      label: "DATA WINDOW",
      value:
        history.length > 0 ? `${history.length} CYCLES` : "NO CYCLES RETAINED",
      measured: history.length > 0,
    },
    naVariable("BODY COMPOSITION", "MUSCLE MASS"),
    naVariable("BODY COMPOSITION", "BODY FAT %"),
    naVariable("BODY COMPOSITION", "VISCERAL FAT"),
    naVariable("BODY COMPOSITION", "LEAN MASS"),
    naVariable("PERFORMANCE", "VO2 MAX"),
    naVariable("PERFORMANCE", "LACTATE THRESHOLD"),
    {
      group: "PERFORMANCE",
      label: "MAX HR",
      value:
        typeof metrics?.maxHeartRate === "number"
          ? `${Math.round(metrics.maxHeartRate)} BPM`
          : "N/A",
      measured: typeof metrics?.maxHeartRate === "number",
    },
    {
      group: "OTHER METRICS",
      label: "RESTING HR",
      value:
        typeof metrics?.restingHeartRate === "number"
          ? `${Math.round(metrics.restingHeartRate)} BPM`
          : "N/A",
      measured: typeof metrics?.restingHeartRate === "number",
    },
    {
      group: "OTHER METRICS",
      label: "HRV",
      value:
        typeof metrics?.hrvMs === "number"
          ? `${Math.round(metrics.hrvMs)} MS`
          : "N/A",
      measured: typeof metrics?.hrvMs === "number",
    },
    naVariable("OTHER METRICS", "HYDRATION"),
    naVariable("OTHER METRICS", "STRESS"),
  ];

  return {
    person: input.person,
    displayName: input.displayName,
    identityLabel: "ROWZY DASHBOARD MEMBER",
    verified: connected,
    headline,
    photos: input.photos,
    comparison: buildPhotoComparison(input.photos),
    social: socialReach,
    timeline,
    knownVariables,
    lastSyncedAt: input.connection.lastSyncedAt,
    generatedAt: input.generatedAt,
  };
}
