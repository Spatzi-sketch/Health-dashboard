import { WHOOP_DASHBOARD_HISTORY_DAYS } from "./constants";
import type {
  WhoopDailyMetrics,
  WhoopMetricHistoryPoint,
} from "./contract";

export type LockedInCategoryKey =
  | "recovery"
  | "sleep"
  | "autonomic"
  | "loadBalance"
  | "stability";

export interface LockedInCategory {
  key: LockedInCategoryKey;
  label: string;
  weight: number;
  score: number | null;
  contribution: number | null;
  evidence: string;
}

export interface LockedInResult {
  score: number | null;
  coverage: number;
  categories: LockedInCategory[];
}

export interface LockedInHistoryPoint {
  recordedAt: string;
  score: number | null;
  coverage: number;
}

const CATEGORY_WEIGHTS: Record<LockedInCategoryKey, number> = {
  recovery: 0.3,
  sleep: 0.25,
  autonomic: 0.2,
  loadBalance: 0.15,
  stability: 0.1,
};

const MINIMUM_SCORE_COVERAGE = 0.5;
const MINIMUM_CATEGORY_COUNT = 2;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundedScore(value: number | null): number | null {
  return value === null ? null : Math.round(clamp(value));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function historyValues(
  history: WhoopMetricHistoryPoint[] | undefined,
  field: keyof WhoopMetricHistoryPoint,
  excludeLatest = true,
): number[] {
  const ordered = [...(history ?? [])].sort((left, right) => {
    const leftTime = Date.parse(left.recordedAt);
    const rightTime = Date.parse(right.recordedAt);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    return leftTime - rightTime;
  });
  const source = excludeLatest ? ordered.slice(0, -1) : ordered;
  return source
    .map((point) => finite(point[field] as number | null | undefined))
    .filter((value): value is number => value !== null);
}

function trendScore(
  latest: number | null,
  baseline: number | null,
  direction: "higher" | "lower",
): number | null {
  if (latest === null || baseline === null || baseline === 0) return null;
  const change = (latest - baseline) / Math.abs(baseline);
  const signed = direction === "higher" ? change : -change;
  return clamp(50 + signed * 200);
}

function recoveryCategory(metrics: WhoopDailyMetrics): number | null {
  return roundedScore(finite(metrics.recoveryScore));
}

function sleepCategory(metrics: WhoopDailyMetrics): number | null {
  const performance = finite(metrics.sleepPerformance);
  const efficiency = finite(metrics.sleepEfficiencyPercentage);
  const consistency = finite(metrics.sleepConsistencyPercentage);
  const duration = finite(metrics.sleepDurationMinutes);
  const need = finite(metrics.sleepNeedMinutes);
  const durationScore =
    duration !== null && need !== null && need > 0
      ? clamp((duration / need) * 100)
      : null;

  // WHOOP Sleep Performance already summarizes sleep need, so do not count
  // the same inputs twice. When it is unavailable, require all three raw
  // normalized signals before activating the category.
  if (performance !== null) return roundedScore(performance);
  if (
    durationScore === null ||
    efficiency === null ||
    consistency === null
  ) {
    return null;
  }
  return roundedScore((durationScore + efficiency + consistency) / 3);
}

function autonomicCategory(metrics: WhoopDailyMetrics): number | null {
  const hrv = finite(metrics.hrvMs);
  const restingHeartRate = finite(metrics.restingHeartRate);
  const hrvHistory = historyValues(metrics.history, "hrvMs");
  const rhrHistory = historyValues(metrics.history, "restingHeartRate");
  const hrvBaseline = hrvHistory.length >= 5 ? median(hrvHistory) : null;
  const rhrBaseline = rhrHistory.length >= 5 ? median(rhrHistory) : null;

  const hrvScore = trendScore(hrv, hrvBaseline, "higher");
  const restingHeartRateScore = trendScore(
    restingHeartRate,
    rhrBaseline,
    "lower",
  );
  if (hrvScore === null || restingHeartRateScore === null) return null;
  return roundedScore((hrvScore + restingHeartRateScore) / 2);
}

function loadBalanceCategory(metrics: WhoopDailyMetrics): number | null {
  const completedStrain = historyValues(metrics.history, "strain");
  if (completedStrain.length < 6) return null;
  const latest = completedStrain.at(-1) ?? null;
  const baseline = median(completedStrain.slice(0, -1));
  if (latest === null || baseline === null || baseline === 0) return null;
  const relativeDifference = Math.abs(latest - baseline) / baseline;
  return roundedScore(100 - relativeDifference * 100);
}

function stabilityCategory(metrics: WhoopDailyMetrics): number | null {
  const skinTemperature = finite(metrics.skinTempCelsius);
  const temperatureHistory = historyValues(metrics.history, "skinTempCelsius");
  const temperatureBaseline =
    temperatureHistory.length >= 5 ? median(temperatureHistory) : null;
  const temperatureScore =
    skinTemperature === null || temperatureBaseline === null
      ? null
      : clamp(100 - Math.abs(skinTemperature - temperatureBaseline) * 40);

  // SpO2 remains visible in the dashboard but is intentionally excluded from
  // this experimental heuristic; personal stability must not normalize away
  // an unsafe absolute value.
  return roundedScore(temperatureScore);
}

const CATEGORY_META: Array<{
  key: LockedInCategoryKey;
  label: string;
  evidence: string;
  calculate: (metrics: WhoopDailyMetrics) => number | null;
}> = [
  {
    key: "recovery",
    label: "Recovery",
    evidence: "Official WHOOP Recovery",
    calculate: recoveryCategory,
  },
  {
    key: "sleep",
    label: "Sleep",
    evidence: "Performance, need, efficiency and consistency",
    calculate: sleepCategory,
  },
  {
    key: "autonomic",
    label: "Autonomic",
    evidence: "HRV and resting HR versus personal baseline",
    calculate: autonomicCategory,
  },
  {
    key: "loadBalance",
    label: "Strain consistency",
    evidence: "Previous recorded strain versus trailing personal median",
    calculate: loadBalanceCategory,
  },
  {
    key: "stability",
    label: "Temperature stability",
    evidence: "Skin temperature versus personal baseline; SpO2 is display-only",
    calculate: stabilityCategory,
  },
];

/**
 * Computes ROWZY's transparent, non-medical daily readiness composite.
 * Missing categories are excluded and the remaining weights are normalized;
 * a missing value is never converted to zero.
 */
export function calculateLockedInScore(
  metrics: WhoopDailyMetrics | null | undefined,
): LockedInResult {
  if (!metrics) {
    return {
      score: null,
      coverage: 0,
      categories: CATEGORY_META.map(({ key, label, evidence }) => ({
        key,
        label,
        evidence,
        weight: CATEGORY_WEIGHTS[key],
        score: null,
        contribution: null,
      })),
    };
  }

  const raw = CATEGORY_META.map((category) => ({
    ...category,
    weight: CATEGORY_WEIGHTS[category.key],
    score: category.calculate(metrics),
  }));
  const availableWeight = raw.reduce(
    (sum, category) => sum + (category.score === null ? 0 : category.weight),
    0,
  );
  const availableCategoryCount = raw.filter(
    (category) => category.score !== null,
  ).length;
  const hasEnoughEvidence =
    availableWeight >= MINIMUM_SCORE_COVERAGE &&
    availableCategoryCount >= MINIMUM_CATEGORY_COUNT;
  const score =
    !hasEnoughEvidence
      ? null
      : Math.round(
          raw.reduce(
            (sum, category) =>
              sum +
              (category.score === null
                ? 0
                : category.score * category.weight),
            0,
          ) / availableWeight,
        );
  const contributionByKey = new Map<LockedInCategoryKey, number>();
  if (score !== null) {
    const allocations = raw
      .filter(
        (category): category is typeof category & { score: number } =>
          category.score !== null,
      )
      .map((category) => {
        const exact = (category.score * category.weight) / availableWeight;
        return {
          key: category.key,
          points: Math.floor(exact),
          fraction: exact - Math.floor(exact),
        };
      });
    let remaining =
      score - allocations.reduce((sum, allocation) => sum + allocation.points, 0);
    for (const allocation of [...allocations].sort(
      (left, right) => right.fraction - left.fraction,
    )) {
      if (remaining <= 0) break;
      allocation.points += 1;
      remaining -= 1;
    }
    allocations.forEach(({ key, points }) => contributionByKey.set(key, points));
  }

  return {
    score,
    coverage: Math.round(availableWeight * 100),
    categories: raw.map(({ key, label, evidence, weight, score: value }) => ({
      key,
      label,
      evidence,
      weight,
      score: value,
      contribution:
        value === null || !hasEnoughEvidence
          ? null
          : (contributionByKey.get(key) ?? null),
    })),
  };
}

/**
 * Replays the exact Locked In formula across the visible rolling history.
 * Each day can see only itself and earlier days, so the trace never leaks
 * future measurements into a historical score.
 */
export function calculateLockedInScoreHistory(
  metrics: WhoopDailyMetrics | null | undefined,
): LockedInHistoryPoint[] {
  const ordered = [...(metrics?.history ?? [])].sort((left, right) => {
    const leftTime = Date.parse(left.recordedAt);
    const rightTime = Date.parse(right.recordedAt);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    return leftTime - rightTime;
  });
  const windowStart = Math.max(0, ordered.length - WHOOP_DASHBOARD_HISTORY_DAYS);

  return ordered.slice(windowStart).map((point, visibleIndex) => {
    const historyIndex = windowStart + visibleIndex;
    const { recordedAt, ...dailyMetrics } = point;
    const result = calculateLockedInScore({
      ...dailyMetrics,
      history: ordered.slice(0, historyIndex + 1),
    });

    return {
      recordedAt,
      score: result.score,
      coverage: result.coverage,
    };
  });
}
