"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { syncWhoopAction } from "@/app/whoop-actions";
import {
  formatLastSynced,
  type WhoopConnection,
  type WhoopConnectionStatus,
  type WhoopDailyMetrics,
  type WhoopMetricHistoryPoint,
} from "@/features/dashboard/whoop-fixtures";
import {
  calculateLockedInScore,
  calculateLockedInScoreHistory,
  type LockedInHistoryPoint,
  type LockedInResult,
} from "@/lib/whoop/locked-in-score";
import {
  LOCKED_IN_TREND_WINDOWS,
  formatTrendPercent,
  formatTrendPercentSigned,
  formatTrendPoints,
  lockedInTrend,
  trendGlyph,
  type LockedInTrend,
  type LockedInTrendWindow,
} from "@/lib/whoop/locked-in-trend";
import { AgeOrbitGlobe } from "./age-orbit-globe";
import styles from "./whoop-connection-card.module.css";

const RING_RADIUS = 76;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const STATUS_LABELS: Record<WhoopConnectionStatus, string> = {
  disconnected: "Not connected",
  connected: "Connected",
  syncing: "Syncing…",
  error: "Connection error",
};

const GRAPH_CHANNELS: Record<GraphDefinition["key"], string> = {
  recovery: "REC.01",
  sleep: "SLP.02",
  autonomic: "AUT.03",
  strain: "LOAD.04",
};

const VITAL_CHANNELS: Record<string, string> = {
  "sleep-efficiency": "S1",
  hrv: "A2",
  "resting-heart-rate": "A3",
  "blood-oxygen": "O2",
  "skin-temperature": "TΔ",
  "average-heart-rate": "Hμ",
  "maximum-heart-rate": "H↑",
  energy: "EΣ",
};

type MetricKey =
  | "recovery"
  | "sleep"
  | "hrv"
  | "restingHeartRate"
  | "strain"
  | "sleepEfficiency"
  | "bloodOxygen"
  | "skinTemperature"
  | "averageHeartRate"
  | "maxHeartRate"
  | "energy";

type NumericHistoryField = Exclude<
  keyof WhoopMetricHistoryPoint,
  "recordedAt"
>;

interface MetricDefinition {
  key: MetricKey;
  label: string;
  value: number | null;
  formattedValue: string;
  unit: string;
  description: string;
  history: number[];
}

interface GraphDefinition {
  key: "recovery" | "sleep" | "autonomic" | "strain";
  eyebrow: string;
  label: string;
  value: string;
  unit: string;
  values: number[];
  secondaryValues?: number[];
  secondaryLabel?: string;
  metric: MetricDefinition;
}

interface VitalDefinition {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
  values: number[];
  metric: MetricDefinition;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactValue(value: number | null, decimals = 0): string {
  return value === null ? "—" : value.toFixed(decimals);
}

function formatEnergy(kilojoule: number | null): string {
  return kilojoule === null ? "—" : Math.round(kilojoule * 0.239006).toLocaleString();
}

function numericHistory(
  history: WhoopMetricHistoryPoint[] | undefined,
  field: NumericHistoryField,
): number[] {
  return (history ?? [])
    .map((point) => finiteOrNull(point[field] as number | null | undefined))
    .filter((value): value is number => value !== null);
}

function signedDelta(
  values: number[],
  decimals = 0,
  inverse = false,
): { label: string; tone: VitalDefinition["tone"] } {
  if (values.length < 2) return { label: "BASELINE", tone: "neutral" };
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? current;
  const change = current - previous;
  if (Math.abs(change) < 10 ** -decimals / 2) {
    return { label: "±0", tone: "neutral" };
  }
  const favorable = inverse ? change < 0 : change > 0;
  return {
    label: `${change > 0 ? "+" : ""}${change.toFixed(decimals)}`,
    tone: favorable ? "positive" : "negative",
  };
}

function metric(
  key: MetricKey,
  label: string,
  value: number | null,
  formattedValue: string,
  unit: string,
  description: string,
  history: number[],
): MetricDefinition {
  return { key, label, value, formattedValue, unit, description, history };
}

function buildPresentation(metrics: WhoopDailyMetrics | null | undefined): {
  graphs: GraphDefinition[];
  vitals: VitalDefinition[];
} {
  const history = metrics?.history;
  const recovery = finiteOrNull(metrics?.recoveryScore);
  const sleep = finiteOrNull(metrics?.sleepPerformance);
  const strain = finiteOrNull(metrics?.strain);
  const hrv = finiteOrNull(metrics?.hrvMs);
  const restingHeartRate = finiteOrNull(metrics?.restingHeartRate);
  const sleepEfficiency = finiteOrNull(metrics?.sleepEfficiencyPercentage);
  const spo2 = finiteOrNull(metrics?.spo2Percentage);
  const skinTemp = finiteOrNull(metrics?.skinTempCelsius);
  const averageHeartRate = finiteOrNull(metrics?.averageHeartRate);
  const maxHeartRate = finiteOrNull(metrics?.maxHeartRate);
  const kilojoule = finiteOrNull(metrics?.kilojoule);

  const recoveryHistory = numericHistory(history, "recoveryScore");
  const sleepHistory = numericHistory(history, "sleepPerformance");
  const strainHistory = numericHistory(history, "strain");
  const hrvHistory = numericHistory(history, "hrvMs");
  const rhrHistory = numericHistory(history, "restingHeartRate");
  const efficiencyHistory = numericHistory(history, "sleepEfficiencyPercentage");
  const spo2History = numericHistory(history, "spo2Percentage");
  const skinTempHistory = numericHistory(history, "skinTempCelsius");
  const averageHrHistory = numericHistory(history, "averageHeartRate");
  const maxHrHistory = numericHistory(history, "maxHeartRate");
  const energyHistory = numericHistory(history, "kilojoule").map(
    (value) => value * 0.239006,
  );

  const recoveryMetric = metric(
    "recovery",
    "Recovery",
    recovery,
    compactValue(recovery),
    "%",
    "WHOOP Recovery is the provider score for the latest cycle. ROWZY uses it as one transparent input, not as the entire Locked In score.",
    recoveryHistory,
  );
  const sleepMetric = metric(
    "sleep",
    "Sleep performance",
    sleep,
    compactValue(sleep),
    "%",
    "Sleep performance is WHOOP's scored percentage for the latest non-nap sleep and feeds the transparent Sleep category.",
    sleepHistory,
  );
  const hrvMetric = metric(
    "hrv",
    "Heart rate variability",
    hrv,
    compactValue(hrv),
    "ms",
    "HRV is compared only with this member’s own trailing baseline. Higher or lower is context—not a diagnosis.",
    hrvHistory,
  );
  const rhrMetric = metric(
    "restingHeartRate",
    "Resting heart rate",
    restingHeartRate,
    compactValue(restingHeartRate),
    "bpm",
    "Resting heart rate is shown against the member’s own recent trend and helps explain autonomic movement.",
    rhrHistory,
  );
  const strainMetric = metric(
    "strain",
    "Strain",
    strain,
    compactValue(strain, 1),
    "/ 21",
    "Strain is the actual WHOOP cardiovascular load. ROWZY does not show a made-up target.",
    strainHistory,
  );
  const efficiencyMetric = metric(
    "sleepEfficiency",
    "Sleep efficiency",
    sleepEfficiency,
    compactValue(sleepEfficiency),
    "%",
    "Sleep efficiency is WHOOP's scored share of time in bed spent asleep for the latest primary sleep.",
    efficiencyHistory,
  );
  const oxygenMetric = metric(
    "bloodOxygen",
    "Blood oxygen",
    spo2,
    compactValue(spo2, 1),
    "%",
    "Blood oxygen comes from the latest scored WHOOP recovery record. It is display-only and never changes the experimental Locked In score.",
    spo2History,
  );
  const temperatureMetric = metric(
    "skinTemperature",
    "Skin temperature",
    skinTemp,
    compactValue(skinTemp, 1),
    "°C",
    "Skin temperature is the provider value for the latest cycle. Temperature stability uses deviation from personal history.",
    skinTempHistory,
  );
  const averageHrMetric = metric(
    "averageHeartRate",
    "Average heart rate",
    averageHeartRate,
    compactValue(averageHeartRate),
    "bpm",
    "Average heart rate is a supporting cycle fact. It does not add duplicate points to Locked In.",
    averageHrHistory,
  );
  const maxHrMetric = metric(
    "maxHeartRate",
    "Maximum heart rate",
    maxHeartRate,
    compactValue(maxHeartRate),
    "bpm",
    "Maximum heart rate is a supporting cycle fact and is intentionally excluded from the composite score.",
    maxHrHistory,
  );
  const energyMetric = metric(
    "energy",
    "Energy used",
    kilojoule,
    formatEnergy(kilojoule),
    "kcal",
    "Energy is converted from WHOOP kilojoules for readability and stays outside the Locked In formula.",
    energyHistory,
  );

  const deltas = {
    efficiency: signedDelta(efficiencyHistory),
    hrv: signedDelta(hrvHistory),
    rhr: signedDelta(rhrHistory, 0, true),
    oxygen: signedDelta(spo2History, 1),
    temperature: signedDelta(skinTempHistory, 1, true),
    averageHr: signedDelta(averageHrHistory, 0, true),
    maxHr: signedDelta(maxHrHistory, 0, true),
    energy: signedDelta(energyHistory, 0),
  };

  return {
    graphs: [
      {
        key: "recovery",
        eyebrow: "RECOVERY · 14 DAYS",
        label: "Recovery",
        value: compactValue(recovery),
        unit: "%",
        values: recoveryHistory,
        metric: recoveryMetric,
      },
      {
        key: "sleep",
        eyebrow: "SLEEP · 14 NIGHTS",
        label: "Sleep",
        value: compactValue(sleep),
        unit: "%",
        values: sleepHistory,
        metric: sleepMetric,
      },
      {
        key: "autonomic",
        eyebrow: "HRV / RESTING HR",
        label: "Autonomic",
        value: compactValue(hrv),
        unit: hrv === null ? "" : `ms · ${compactValue(restingHeartRate)} bpm`,
        values: hrvHistory,
        secondaryValues: rhrHistory,
        secondaryLabel: "Resting HR",
        metric: hrvMetric,
      },
      {
        key: "strain",
        eyebrow: "ACTUAL LOAD · 14 DAYS",
        label: "Strain",
        value: compactValue(strain, 1),
        unit: strain === null ? "" : "/ 21",
        values: strainHistory,
        metric: strainMetric,
      },
    ],
    vitals: [
      {
        key: "sleep-efficiency",
        icon: "◒",
        label: "Sleep efficiency",
        value: sleepEfficiency === null ? "—" : `${sleepEfficiency.toFixed(0)}%`,
        delta: deltas.efficiency.label,
        tone: deltas.efficiency.tone,
        values: efficiencyHistory,
        metric: efficiencyMetric,
      },
      {
        key: "hrv",
        icon: "⌁",
        label: "HRV",
        value: hrv === null ? "—" : `${hrv.toFixed(0)} ms`,
        delta: deltas.hrv.label,
        tone: deltas.hrv.tone,
        values: hrvHistory,
        metric: hrvMetric,
      },
      {
        key: "resting-heart-rate",
        icon: "♡",
        label: "Resting heart rate",
        value: restingHeartRate === null ? "—" : `${restingHeartRate.toFixed(0)} bpm`,
        delta: deltas.rhr.label,
        tone: deltas.rhr.tone,
        values: rhrHistory,
        metric: rhrMetric,
      },
      {
        key: "blood-oxygen",
        icon: "◎",
        label: "Blood oxygen",
        value: spo2 === null ? "—" : `${spo2.toFixed(1)}%`,
        delta: deltas.oxygen.label,
        tone: deltas.oxygen.tone,
        values: spo2History,
        metric: oxygenMetric,
      },
      {
        key: "skin-temperature",
        icon: "◉",
        label: "Skin temperature",
        value: skinTemp === null ? "—" : `${skinTemp.toFixed(1)}°C`,
        delta: deltas.temperature.label,
        tone: deltas.temperature.tone,
        values: skinTempHistory,
        metric: temperatureMetric,
      },
      {
        key: "average-heart-rate",
        icon: "⌇",
        label: "Average heart rate",
        value: averageHeartRate === null ? "—" : `${averageHeartRate.toFixed(0)} bpm`,
        delta: deltas.averageHr.label,
        tone: deltas.averageHr.tone,
        values: averageHrHistory,
        metric: averageHrMetric,
      },
      {
        key: "maximum-heart-rate",
        icon: "△",
        label: "Maximum heart rate",
        value: maxHeartRate === null ? "—" : `${maxHeartRate.toFixed(0)} bpm`,
        delta: deltas.maxHr.label,
        tone: deltas.maxHr.tone,
        values: maxHrHistory,
        metric: maxHrMetric,
      },
      {
        key: "energy",
        icon: "ϟ",
        label: "Energy used",
        value: kilojoule === null ? "—" : `${formatEnergy(kilojoule)} kcal`,
        delta: deltas.energy.label,
        tone: deltas.energy.tone,
        values: energyHistory,
        metric: energyMetric,
      },
    ],
  };
}

function scoreCopy(score: number | null, coverage: number) {
  if (score === null) {
    if (coverage > 0) {
      return {
        badge: "CALIBRATION ACTIVE",
        lead: "SIGNAL MATRIX INCOMPLETE",
        rest: "50% verified coverage required to resolve today’s score.",
      };
    }
    return {
      badge: "NO BIOFEED",
      lead: "AWAITING VERIFIED INPUT",
      rest: "Connect WHOOP and run the first secure sync.",
    };
  }
  if (score >= 85) {
    return {
      badge: "ALIGNMENT 01",
      lead: "SYSTEM COHERENCE HIGH",
      rest: "Verified inputs are strongly aligned with recent context.",
    };
  }
  if (score >= 70) {
    return {
      badge: "ALIGNMENT 02",
      lead: "SYSTEM COHERENCE NOMINAL",
      rest: "Most verified inputs are tracking favorably.",
    };
  }
  if (score >= 55) {
    return {
      badge: "ALIGNMENT 03",
      lead: "SYSTEM COHERENCE MIXED",
      rest: "Verified inputs remain near personal context.",
    };
  }
  return {
    badge: "SIGNAL REVIEW",
    lead: "COHERENCE BELOW BASELINE",
    rest: "Inspect source channels before changing today’s plan.",
  };
}

function StatusIcon({ status }: { status: WhoopConnectionStatus }) {
  if (status === "syncing") {
    return <span className={styles.spinner} aria-hidden="true" />;
  }
  return (
    <svg className={styles.statusIcon} viewBox="0 0 12 12" aria-hidden="true">
      {status === "connected" ? (
        <>
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" />
          <path
            d="M3.8 6.2l1.5 1.5 2.9-3.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : status === "error" ? (
        <>
          <path
            d="M6 1.6l4.8 8.3H1.2L6 1.6z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
          />
          <path d="M6 5v2.4" stroke="currentColor" strokeLinecap="round" />
        </>
      ) : (
        <circle
          cx="6"
          cy="6"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeDasharray="2.4 2.1"
        />
      )}
    </svg>
  );
}

function shortDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  // Cycle days are named in one fixed timezone, not the browser's: a
  // browser-local label would shift most days one back for some viewers
  // (two AUG 15s, no AUG 17). Fixed, so the server render and every device
  // agree. The demo data is generated in UTC.
  return date
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

/**
 * The 30-day Locked In line behind the dial: real scores only, a dashed
 * personal average, the comparison window the chip is using, and an end
 * marker that names the last scored day when the band has gone quiet.
 */
function timedPoints(points: readonly LockedInHistoryPoint[]) {
  return points
    .map((point) => ({ at: Date.parse(point.recordedAt), score: point.score, recordedAt: point.recordedAt }))
    .filter((point) => Number.isFinite(point.at))
    .sort((left, right) => left.at - right.at);
}

/**
 * The faint trace behind the dial (decorative). X is time, so a band that
 * stopped reporting leaves the rest of the month empty instead of stretching.
 */
function LockedInHistoryTrace({
  points,
  staleDays,
}: {
  points: readonly LockedInHistoryPoint[];
  staleDays: number | null;
}) {
  const width = 320;
  const height = 88;
  const timed = timedPoints(points);
  const scored = timed.filter((point) => point.score !== null);
  if (!scored.length) return null;
  const startAt = timed[0].at;
  const lastScoredAt = scored.at(-1)!.at;
  const endAt = Math.max(timed.at(-1)!.at, lastScoredAt + (staleDays ?? 0) * 86_400_000);
  const span = Math.max(1, endAt - startAt);
  const x = (at: number) => 8 + ((at - startAt) / span) * (width - 16);
  const y = (score: number) => 8 + (1 - clamp(score, 0, 100) / 100) * (height - 16);
  const path = timedScorePath(timed, x, y);
  if (!path) return null;

  return (
    <svg
      className={styles.scoreHistoryTrace}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g className={styles.scoreHistoryGrid}>
        <line x1="8" y1="20" x2="312" y2="20" />
        <line x1="8" y1="44" x2="312" y2="44" />
        <line x1="8" y1="68" x2="312" y2="68" />
      </g>
      <path className={styles.scoreHistoryEcho} d={path} transform="translate(0 -5)" />
      <path className={styles.scoreHistoryEcho} d={path} transform="translate(0 5)" />
      <path className={styles.scoreHistoryLine} d={path} />
    </svg>
  );
}

/**
 * The Locked In graph under the dial: the same minimal line as the metric
 * cards below it, 30 days, with a dashed personal average, and scrubbable
 * with a finger, trackpad or mouse — the readout names the day and score
 * under the pointer. A band that stopped reporting ends the line where it
 * stopped; the rest of the month stays empty.
 */
function LockedInScrubGraph({
  points,
  trend,
  onWindowChange,
}: {
  points: readonly LockedInHistoryPoint[];
  trend: LockedInTrend;
  onWindowChange: (window: LockedInTrendWindow) => void;
}) {
  const width = 180;
  const height = 56;
  const timed = useMemo(() => timedPoints(points), [points]);
  const scored = timed.filter((point) => point.score !== null);
  const [active, setActive] = useState<number | null>(null);
  if (scored.length < 2) return null;
  const startAt = timed[0].at;
  const lastScoredAt = scored.at(-1)!.at;
  const endAt = Math.max(timed.at(-1)!.at, lastScoredAt + (trend.staleDays ?? 0) * 86_400_000);
  const span = Math.max(1, endAt - startAt);
  const x = (at: number) => 4 + ((at - startAt) / span) * (width - 8);
  const y = (score: number) => 5 + (1 - clamp(score, 0, 100) / 100) * (height - 10);
  const path = timedScorePath(timed, x, y);
  const average = scored.reduce((sum, point) => sum + (point.score ?? 0), 0) / scored.length;
  const selected = active === null ? scored.at(-1)! : scored[active]!;
  const percent = formatTrendPercent(trend);
  const glyph = trendGlyph(trend);

  const pick = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const at = startAt + ratio * span;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    scored.forEach((point, index) => {
      const distance = Math.abs(point.at - at);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setActive(best);
  };

  return (
    <div className={styles.lockedInGraph} data-active={active === null ? "false" : "true"}>
      <div className={styles.lockedInGraphHead}>
        <p className={styles.lockedInGraphReadout}>
          <span>
            {active === null
              ? `LOCKED IN · ${shortDay(selected.recordedAt)} ·`
              : `${shortDay(selected.recordedAt)} ·`}
          </span>
          <strong>{selected.score}</strong>
          {active === null && percent && glyph ? (
            <b data-direction={trend.direction ?? "flat"}>{`${glyph} ${percent}`}</b>
          ) : null}
        </p>
        <div className={styles.trendTabs} role="group" aria-label="Locked In change window">
          {LOCKED_IN_TREND_WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              aria-pressed={trend.window === window}
              onClick={() => onWindowChange(window)}
            >
              {window}
            </button>
          ))}
        </div>
      </div>
      <div
        className={styles.lockedInGraphPlot}
        onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
        onPointerDown={(event) => pick(event.clientX, event.currentTarget)}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label={`Locked In, last ${scored.length} days, latest ${selected.score}`}
      >
        <svg
          className={styles.lockedInGraphSvg}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line className={styles.lockedInGraphAverage} x1="4" x2={width - 4} y1={y(average)} y2={y(average)} />
          <path className={styles.primaryTrend} d={path} />
          <circle className={styles.lockedInGraphDot} cx={x(selected.at)} cy={y(selected.score ?? 0)} r="2.2" />
          {active !== null ? (
            <line className={styles.lockedInGraphCursor} x1={x(selected.at)} x2={x(selected.at)} y1="2" y2={height - 2} />
          ) : null}
        </svg>
      </div>
      <div className={styles.graphAxis} aria-hidden="true">
        <span>{shortDay(timed[0].recordedAt)}</span>
        <span>{`AVG ${Math.round(average)}`}</span>
        <span>
          {(trend.staleDays ?? 0) >= 1
            ? `LAST ${shortDay(scored.at(-1)!.recordedAt)}`
            : "NOW"}
        </span>
      </div>
    </div>
  );
}

function LockedInVisual({
  result,
  shownScore,
  drawn,
  historyPoints,
  trend,
  onWindowChange,
  showSwitch,
}: {
  result: LockedInResult;
  shownScore: number | null;
  drawn: boolean;
  historyPoints: readonly LockedInHistoryPoint[];
  trend: LockedInTrend;
  onWindowChange: (window: LockedInTrendWindow) => void;
  showSwitch: boolean;
}) {
  const copy = scoreCopy(result.score, result.coverage);
  const percent = formatTrendPercent(trend);
  const glyph = trendGlyph(trend);
  const chipTitle =
    trend.delta === null
      ? trend.basis
      : `${trend.window}: ${formatTrendPoints(trend)} points (${percent}) ${trend.basis}`;
  // Before the composite unlocks, use the arc to show verified coverage while
  // keeping the center value blank. This preserves the no-invented-score rule
  // without making a partially calibrated dashboard look inert.
  const ringValue = result.score ?? result.coverage;
  const targetOffset =
    RING_CIRCUMFERENCE * (1 - clamp(ringValue, 0, 100) / 100);

  return (
    <div className={styles.scoreBlock} data-trend-window={trend.window}>
      <LockedInHistoryTrace points={historyPoints} staleDays={trend.staleDays} />
      {showSwitch ? (
        <div
          className={`${styles.trendTabs} ${styles.trendTabsCorner}`}
          role="group"
          aria-label="Locked In change window"
        >
          {LOCKED_IN_TREND_WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              aria-pressed={trend.window === window}
              onClick={() => onWindowChange(window)}
            >
              {window}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.orb}>
        <span className={styles.orbitTicks} aria-hidden="true" />
        <span className={styles.orbCrosshair} aria-hidden="true" />
        <span className={styles.orbitNode} aria-hidden="true" />
        <svg className={styles.ring} viewBox="0 0 180 180" aria-hidden="true">
          <circle className={styles.ringTrack} cx="90" cy="90" r={RING_RADIUS} />
          <circle
            className={styles.ringArc}
            cx="90"
            cy="90"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={drawn ? targetOffset : RING_CIRCUMFERENCE}
          />
        </svg>
        <div className={styles.orbCenter}>
          <span className={styles.orbLabel}>LOCKED IN</span>
          <span className={styles.orbNumberRow}>
            <span
              className={styles.orbNumber}
              data-direction={shownScore === null ? undefined : trend.direction ?? "flat"}
            >
              {shownScore ?? "—"}
            </span>
            {shownScore !== null && percent && glyph ? (
              <span
                className={styles.trendChip}
                data-direction={trend.direction ?? "flat"}
                title={chipTitle}
                aria-label={chipTitle}
              >
                <i aria-hidden="true">{glyph}</i>
                <b>{percent}</b>
              </span>
            ) : null}
          </span>
          <span className={styles.orbScale}>OUT OF 100</span>
        </div>
        <span className={`${styles.verdict} ${drawn ? styles.verdictIn : ""}`}>
          <i aria-hidden="true" />
          {copy.badge}
        </span>
        <span className={styles.orbTelemetry} aria-hidden="true">
          {result.score === null
            ? `VERIFIED ${result.coverage}%`
            : `RESOLVED ${result.score}%`}
        </span>
      </div>
      <p className={styles.scoreMessage}>
        <strong>{copy.lead}</strong>
        <span>{copy.rest}</span>
      </p>
      <p className={styles.coverageLabel}>
        {result.coverage}% VERIFIED COVERAGE
        {trend.latest && (trend.staleDays ?? 0) >= 2 ? (
          <span className={styles.staleNote}>
            {` · AS OF ${shortDay(trend.latest.recordedAt)} · NO DATA ${trend.staleDays}D`}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function AnimatedLockedInScoreValue({
  result,
  historyPoints,
  trend,
  onWindowChange,
  showSwitch,
}: {
  result: LockedInResult;
  historyPoints: readonly LockedInHistoryPoint[];
  trend: LockedInTrend;
  onWindowChange: (window: LockedInTrendWindow) => void;
  showSwitch: boolean;
}) {
  const target = result.score ?? 0;
  const [shownScore, setShownScore] = useState(0);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let frame = 0;
    let start = 0;
    const drawFrame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reducedMotion) {
        setShownScore(Math.round(target));
        setDrawn(true);
        return;
      }
      setDrawn(true);
      frame = window.requestAnimationFrame(animate);
    });

    function animate(time: number) {
      if (!start) start = time;
      const progress = clamp((time - start) / 1500, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShownScore(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(drawFrame);
    };
  }, [target]);

  return (
    <LockedInVisual
      result={result}
      shownScore={shownScore}
      drawn={drawn}
      historyPoints={historyPoints}
      trend={trend}
      onWindowChange={onWindowChange}
      showSwitch={showSwitch}
    />
  );
}

function AnimatedLockedInScore({
  result,
  historyPoints,
  trend,
  onWindowChange,
  showSwitch,
}: {
  result: LockedInResult;
  historyPoints: readonly LockedInHistoryPoint[];
  trend: LockedInTrend;
  onWindowChange: (window: LockedInTrendWindow) => void;
  showSwitch: boolean;
}) {
  if (result.score === null) {
    return (
      <LockedInVisual
        result={result}
        shownScore={null}
        drawn
        historyPoints={historyPoints}
        trend={trend}
        onWindowChange={onWindowChange}
        showSwitch={showSwitch}
      />
    );
  }
  return (
    <AnimatedLockedInScoreValue
      key={result.score}
      result={result}
      historyPoints={historyPoints}
      trend={trend}
      onWindowChange={onWindowChange}
      showSwitch={showSwitch}
    />
  );
}

function linePath(
  values: number[],
  width = 180,
  height = 56,
  insetX = 5,
  insetY = 9,
): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1
        ? width / 2
        : insetX + (index / (values.length - 1)) * (width - insetX * 2);
      const y = height - insetY - ((value - min) / spread) * (height - insetY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function timedScorePath(
  timed: ReadonlyArray<{ at: number; score: number | null }>,
  x: (at: number) => number,
  y: (score: number) => number,
): string {
  const commands: string[] = [];
  let drawing = false;
  for (const point of timed) {
    if (point.score === null || !Number.isFinite(point.score)) {
      drawing = false;
      continue;
    }
    commands.push(`${drawing ? "L" : "M"}${x(point.at).toFixed(2)} ${y(point.score).toFixed(2)}`);
    drawing = true;
  }
  return commands.join(" ");
}

function MiniTrend({
  values,
  secondaryValues,
  compact = false,
}: {
  values: number[];
  secondaryValues?: number[];
  compact?: boolean;
}) {
  const path = useMemo(() => linePath(values), [values]);
  const secondaryPath = useMemo(
    () => linePath(secondaryValues ?? []),
    [secondaryValues],
  );

  if (!path) {
    return (
      <div className={compact ? styles.microEmpty : styles.graphEmpty}>
        <i />
        <span>{compact ? "—" : "AWAITING NORMALIZED DATA"}</span>
      </div>
    );
  }

  return (
    <svg
      className={compact ? styles.microTrend : styles.graphTrend}
      viewBox="0 0 180 56"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {compact ? null : (
        <>
          <line x1="0" y1="14" x2="180" y2="14" />
          <line x1="0" y1="31" x2="180" y2="31" />
          <line x1="0" y1="48" x2="180" y2="48" />
        </>
      )}
      {compact ? null : (
        <>
          <path className={styles.trendEcho} d={path} transform="translate(0 -4)" />
          <path className={styles.trendEcho} d={path} transform="translate(0 4)" />
        </>
      )}
      <path className={styles.primaryTrend} d={path} />
      {secondaryPath ? (
        <path className={styles.secondaryTrend} d={secondaryPath} />
      ) : null}
    </svg>
  );
}

function GraphCard({
  graph,
  onOpen,
}: {
  graph: GraphDefinition;
  onOpen: (metric: MetricDefinition) => void;
}) {
  return (
    <article className={styles.graphCard} data-graph={graph.key}>
      <div className={styles.graphTopline}>
        <p><span>{GRAPH_CHANNELS[graph.key]}</span>{graph.eyebrow}</p>
        <button
          type="button"
          onClick={() => onOpen(graph.metric)}
          aria-label={`About ${graph.label}`}
        >
          ?
        </button>
      </div>
      <p className={styles.graphValue}>
        <strong>{graph.value}</strong>
        <span>{graph.unit}</span>
      </p>
      <MiniTrend
        values={graph.values}
        secondaryValues={graph.secondaryValues}
      />
      <div className={styles.graphAxis} aria-hidden="true">
        <span>-14D</span>
        <span>NOW</span>
      </div>
    </article>
  );
}

function VitalRow({
  vital,
  onOpen,
}: {
  vital: VitalDefinition;
  onOpen: (metric: MetricDefinition) => void;
}) {
  return (
    <button
      className={styles.vitalRow}
      type="button"
      onClick={() => onOpen(vital.metric)}
      aria-label={`View ${vital.label} details`}
    >
      <span className={styles.vitalName}>
        <i aria-hidden="true">{VITAL_CHANNELS[vital.key] ?? vital.icon}</i>
        {vital.label}
      </span>
      <strong>{vital.value}</strong>
      <MiniTrend values={vital.values} compact />
      <span className={styles.vitalDelta} data-tone={vital.tone}>
        {vital.delta}
      </span>
    </button>
  );
}

const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogFocusTrap(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter(
        (element) => !element.hasAttribute("hidden"),
      );
    getFocusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogRef, onClose]);
}

function DetailSheet({
  metric: selectedMetric,
  onClose,
}: {
  metric: MetricDefinition;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusTrap(dialogRef, onClose);

  return (
    <div className={styles.sheet} role="presentation">
      <button
        className={styles.sheetBackdrop}
        type="button"
        onClick={onClose}
        aria-label="Close metric details"
      />
      <section
        ref={dialogRef}
        className={styles.sheetCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-sheet-title"
      >
        <button
          className={styles.sheetClose}
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className={styles.sheetGrip} aria-hidden="true" />
        <p className={styles.sheetLabel} id="metric-sheet-title">
          {selectedMetric.label}
        </p>
        <p className={styles.sheetValue}>
          <strong>{selectedMetric.formattedValue}</strong>
          <span>{selectedMetric.value === null ? "" : selectedMetric.unit}</span>
        </p>
        <p className={styles.sheetDescription}>{selectedMetric.description}</p>
        <div className={styles.sheetSparkWrap}>
          <span>LAST 14 RECORDED CYCLES</span>
          <MiniTrend values={selectedMetric.history} />
        </div>
      </section>
    </div>
  );
}

/** One plain sentence per category: what it measures and what 100 takes. */
const CATEGORY_PLAIN: Record<string, { what: string; hundred: string }> = {
  recovery: {
    what: "WHOOP's own recovery score for the day.",
    hundred: "A green 100% recovery.",
  },
  sleep: {
    what: "Sleep performance: hours slept against the hours WHOOP said you needed.",
    hundred: "Sleeping your full need.",
  },
  autonomic: {
    what: "Today's HRV and resting heart rate against your own 14-day median.",
    hundred: "HRV ~25% above and resting HR ~25% below your baseline.",
  },
  loadBalance: {
    what: "Yesterday's strain against your trailing median strain.",
    hundred: "Training exactly as hard as you usually do.",
  },
  stability: {
    what: "Skin temperature against your own baseline (SpO2 is shown, not scored).",
    hundred: "Within ~0.1°C of your usual.",
  },
};

function ScoreSheet({
  result,
  history,
  trend,
  onWindowChange,
  onClose,
}: {
  result: LockedInResult;
  history: readonly LockedInHistoryPoint[];
  trend: LockedInTrend;
  onWindowChange: (window: LockedInTrendWindow) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusTrap(dialogRef, onClose);
  const percent = formatTrendPercent(trend);
  const glyph = trendGlyph(trend);
  const scored = history.filter((point) => point.score !== null);
  const first = scored[0];
  const last = scored.at(-1);
  const average = scored.length
    ? scored.reduce((sum, point) => sum + (point.score ?? 0), 0) / scored.length
    : null;
  const high = scored.length ? Math.max(...scored.map((point) => point.score ?? 0)) : null;
  const availableWeight = result.categories.reduce(
    (sum, category) => sum + (category.score === null ? 0 : category.weight),
    0,
  );

  return (
    <div className={styles.sheet} role="presentation">
      <button
        className={styles.sheetBackdrop}
        type="button"
        onClick={onClose}
        aria-label="Close score details"
      />
      <section
        ref={dialogRef}
        className={`${styles.sheetCard} ${styles.scoreSheetCard}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-sheet-title"
      >
        <button
          className={styles.sheetClose}
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <p className={styles.scoreSheetLabel} id="score-sheet-title">
          LOCKED IN · SCORE PROTOCOL · FORMULA V1
        </p>

        <div className={styles.scoreSheetHead}>
          <div className={styles.scoreSheetScore}>
            <strong>{result.score ?? "—"}</strong>
            {percent && glyph ? (
              <span className={styles.trendChip} data-direction={trend.direction ?? "flat"}>
                <i aria-hidden="true">{glyph}</i>
                <b>{percent}</b>
              </span>
            ) : null}
            <span className={styles.scoreSheetBasis}>
              {trend.delta === null
                ? trend.basis
                : `${trend.window} · ${formatTrendPoints(trend)} pts · ${formatTrendPercentSigned(trend)} ${trend.basis} (${trend.basisValue})`}
            </span>
          </div>
        </div>

        {scored.length > 1 && first && last ? (
          <div className={styles.scoreSheetGraph}>
            <LockedInScrubGraph points={history} trend={trend} onWindowChange={onWindowChange} />
            <p className={styles.scoreSheetAxis}>
              {`${scored.length} DAYS · AVG ${average === null ? "—" : Math.round(average)} · HIGH ${high ?? "—"}`}
            </p>
          </div>
        ) : null}

        <p className={styles.scoreSheetLine}>
          Score = the weighted average of every category that reported
          ({Math.round(availableWeight * 100)}% of the weight today). Each
          category is 0–100. Missing data is left out, never counted as zero;
          a score needs at least 50% weight across two categories.
        </p>

        <ul className={styles.scoreSheetRows}>
          {result.categories.map((category) => {
            const plain = CATEGORY_PLAIN[category.key];
            const contribution =
              category.score === null || availableWeight === 0
                ? null
                : (category.score * category.weight) / availableWeight;
            return (
              <li key={category.key} data-available={category.score === null ? "false" : "true"}>
                <div className={styles.scoreSheetRowHead}>
                  <span className={styles.scoreSheetName}>{category.label}</span>
                  <span className={styles.scoreSheetWeight}>
                    {Math.round(category.weight * 100)}%
                    {contribution !== null ? ` → +${contribution.toFixed(1)}` : ""}
                  </span>
                  <strong className={styles.scoreSheetValue}>
                    {category.score ?? "—"}
                  </strong>
                </div>
                <span className={styles.scoreSheetBar} aria-hidden="true">
                  <i style={{ width: `${category.score ?? 0}%` }} />
                </span>
                <small className={styles.scoreSheetPlain}>
                  {plain?.what ?? category.evidence}
                  {plain ? <em>{` 100 = ${plain.hundred}`}</em> : null}
                </small>
              </li>
            );
          })}
        </ul>

        <dl className={styles.scoreSheetSources} aria-label="Safe data sources">
          <div><dt>Recovery</dt><dd>Official WHOOP score</dd></div>
          <div><dt>Strain</dt><dd>Your own recorded strain</dd></div>
          <div><dt>HRV</dt><dd>Personal baseline only</dd></div>
          <div><dt>Resting HR</dt><dd>Personal baseline only</dd></div>
        </dl>
        <p className={styles.scoreSheetFoot}>
          Experimental ROWZY blend of your WHOOP signals — not medical guidance,
          not an official WHOOP number.
        </p>
      </section>
    </div>
  );
}

export function WhoopConnectionCard({
  connection,
  canManage,
  referenceTimeIso,
  lockedInGraph = true,
  demo = false,
}: {
  connection: WhoopConnection;
  canManage: boolean;
  referenceTimeIso: string;
  /** Show the scrubbable 30-day Locked In graph under the dial. */
  lockedInGraph?: boolean;
  /** True while the panel renders demo data; shows the panel's DEMO chip. */
  demo?: boolean;
}) {
  const {
    person,
    displayName,
    status,
    lastSyncedAt,
    errorMessage,
    metrics,
  } = connection;
  const [openMetric, setOpenMetric] = useState<MetricDefinition | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const presentation = useMemo(() => buildPresentation(metrics), [metrics]);
  const lockedIn = useMemo(() => calculateLockedInScore(metrics), [metrics]);
  const lockedInHistory = useMemo(
    () => calculateLockedInScoreHistory(metrics),
    [metrics],
  );
  const [trendWindow, setTrendWindow] = useState<LockedInTrendWindow>("1W");
  const trend = useMemo(
    () => lockedInTrend(lockedInHistory, trendWindow, new Date(referenceTimeIso)),
    [lockedInHistory, trendWindow, referenceTimeIso],
  );
  const previousFocus = useRef<HTMLElement | null>(null);

  const rememberFocus = () => {
    previousFocus.current = document.activeElement as HTMLElement | null;
  };
  const closeSheet = () => {
    setOpenMetric(null);
    setScoreOpen(false);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  };
  const openDetails = (selected: MetricDefinition) => {
    rememberFocus();
    setOpenMetric(selected);
  };

  return (
    <article
      className={styles.dashboard}
      data-person={person}
      data-status={status}
      aria-label={`${displayName}'s WHOOP vitals`}
    >
      <section className={styles.commandDeck}>
        <div className={styles.scanField} aria-hidden="true">
          <svg className={styles.topologyField} viewBox="0 0 420 760" preserveAspectRatio="none">
            <path d="M-30 192 C34 169 72 194 126 161 S218 111 274 151 S353 226 448 174" />
            <path d="M-30 207 C42 180 80 208 134 174 S221 125 282 166 S357 240 448 189" />
            <path d="M-30 223 C49 193 90 222 142 189 S225 143 289 183 S361 254 448 205" />
            <path d="M-30 240 C56 207 101 238 151 207 S232 163 297 202 S365 269 448 223" />
            <path d="M-30 259 C62 222 111 255 161 226 S240 185 305 223 S369 285 448 243" />
            <path d="M-30 280 C68 239 121 273 171 247 S247 209 314 244 S374 301 448 265" />
            <path d="M-30 303 C75 258 132 293 182 269 S256 235 323 267 S379 319 448 289" />
            <path d="M-30 328 C82 280 143 315 194 294 S266 263 333 292 S384 340 448 315" />
            <path d="M-30 355 C90 305 155 338 206 321 S278 294 344 319 S390 363 448 343" />
          </svg>
          <span className={styles.scanSweep} />
          <span className={styles.calibrationRail} />
          <span className={styles.panelNotch} />
        </div>

        <header className={styles.personHeader}>
          <div>
            <p className={styles.personName}>{displayName}</p>
            <p className={styles.personSubtitle}>WHOOP · BIOMETRIC NODE</p>
            <p className={styles.panelCode}>
              {person === "luke" ? "BIO-01/L" : "BIO-02/R"} · SECURE INPUT
            </p>
          </div>
          <div className={styles.headerSignals}>
            {demo ? <span className={styles.demoChip}>DEMO</span> : null}
            <p className={styles.statusChip} data-status={status}>
              <StatusIcon status={status} />
              {STATUS_LABELS[status]}
            </p>
            <p className={styles.syncedCompact}>
              {lastSyncedAt ? `SYNCED ${formatLastSynced(lastSyncedAt)}` : "NOT SYNCED"}
            </p>
          </div>
        </header>

        <AnimatedLockedInScore
          result={lockedIn}
          historyPoints={lockedInHistory}
          trend={trend}
          onWindowChange={setTrendWindow}
          showSwitch={!lockedInGraph}
        />
        {lockedInGraph ? (
          <LockedInScrubGraph
            points={lockedInHistory}
            trend={trend}
            onWindowChange={setTrendWindow}
          />
        ) : null}

        <button
          className={styles.scoredButton}
          type="button"
          onClick={() => {
            rememberFocus();
            setScoreOpen(true);
          }}
        >
          OPEN SCORE PROTOCOL
          <span aria-hidden="true">›</span>
        </button>

        <div className={styles.graphGrid}>
          {presentation.graphs.map((graph) => (
            <GraphCard key={graph.key} graph={graph} onOpen={openDetails} />
          ))}
        </div>

        <div className={styles.vitalTable} aria-label={`${displayName}'s supporting vitals`}>
          {presentation.vitals.map((vital) => (
            <VitalRow key={vital.key} vital={vital} onOpen={openDetails} />
          ))}
        </div>

        <section className={styles.driverPanel} aria-label="Score composition versus neutral">
          <p>SIGNAL CONTRIBUTION BUS</p>
          <div>
            {lockedIn.categories.map((category) => (
              <span key={category.key} data-tone={
                category.contribution === null
                  ? "neutral"
                  : category.score !== null && category.score >= 65
                    ? "positive"
                    : category.score !== null && category.score < 50
                      ? "negative"
                      : "neutral"
              }>
                <small>{category.label}</small>
                <strong>
                  {category.contribution === null
                    ? "—"
                    : category.contribution}
                </strong>
              </span>
            ))}
          </div>
        </section>
      </section>

      {status === "error" ? (
        <p className={styles.errorMessage} role="alert">
          {errorMessage ?? "WHOOP sync failed."}
        </p>
      ) : null}

      <footer className={styles.connectionFooter}>
        <p>
          {lastSyncedAt
            ? `Last synced ${formatLastSynced(lastSyncedAt)}`
            : "Awaiting first sync"}
        </p>

        {canManage && status === "disconnected" ? (
          <a className={styles.actionButton} href="/api/whoop/connect">
            Connect WHOOP
          </a>
        ) : null}

        {canManage && status === "connected" ? (
          <form action={syncWhoopAction}>
            <button className={styles.actionButton} type="submit">
              Sync now
            </button>
          </form>
        ) : null}

        {canManage && status === "syncing" ? (
          <form action={syncWhoopAction}>
            <button className={styles.actionButton} type="submit">
              Try sync again
            </button>
          </form>
        ) : null}

        {canManage && status === "error" ? (
          <a className={styles.actionButton} href="/api/whoop/connect">
            Retry connection
          </a>
        ) : null}
      </footer>

      <AgeOrbitGlobe
        person={person}
        displayName={displayName}
        referenceTimeIso={referenceTimeIso}
      />

      {openMetric ? <DetailSheet metric={openMetric} onClose={closeSheet} /> : null}
      {scoreOpen ? (
        <ScoreSheet
          result={lockedIn}
          history={lockedInHistory}
          trend={trend}
          onWindowChange={setTrendWindow}
          onClose={closeSheet}
        />
      ) : null}
    </article>
  );
}
