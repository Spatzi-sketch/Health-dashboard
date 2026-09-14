/**
 * Demo WHOOP connection and progress inputs for the ROWZY starter.
 *
 * A rich, obviously-healthy "connected" state: high recovery, strong HRV,
 * consistent sleep, a full 30-day history for the locked-in trend, plus the
 * weight / photo / workout inputs the Progress Detail composes from. No
 * WHOOP account, keys or network anywhere — the dates are simply generated
 * relative to the request time so the card always reads as freshly synced.
 */

import type {
  Person,
  WhoopConnection,
  WhoopDailyMetrics,
  WhoopMetricHistoryPoint,
} from "./whoop-fixtures";
import type { PhotoTimeline } from "./person-progress";

const DAY_MS = 86_400_000;

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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 30 mornings of steadily improving vitals, ending yesterday. */
function demoHistory(base: Date): WhoopMetricHistoryPoint[] {
  const random = mulberry32(97);
  const points: WhoopMetricHistoryPoint[] = [];
  for (let index = 0; index < 30; index += 1) {
    const daysAgo = 30 - index;
    const progress = index / 29; // 0 → 1 across the window
    const wobble = () => (random() - 0.5) * 2; // -1 → 1
    const recordedAt = new Date(
      base.getTime() - daysAgo * DAY_MS,
    );
    recordedAt.setUTCHours(7, 10, 0, 0);
    const sleepDuration = Math.round(432 + progress * 26 + wobble() * 22);
    const deep = Math.round(88 + progress * 10 + wobble() * 8);
    const rem = Math.round(104 + progress * 14 + wobble() * 10);
    const awake = Math.round(38 - progress * 8 + Math.abs(wobble()) * 6);
    points.push({
      recordedAt: recordedAt.toISOString(),
      recoveryScore: Math.round(74 + progress * 18 + wobble() * 6),
      strain: round1(10.2 + wobble() * 2.4 + progress * 1.6),
      hrvMs: Math.round(96 + progress * 30 + wobble() * 9),
      restingHeartRate: Math.round(48 - progress * 5 + wobble() * 1.5),
      spo2Percentage: round1(97.2 + random() * 1.4),
      skinTempCelsius: round1(33.1 + random() * 0.7),
      averageHeartRate: Math.round(64 - progress * 4 + wobble() * 3),
      maxHeartRate: Math.round(168 + wobble() * 8),
      kilojoule: Math.round(8_400 + progress * 1_400 + wobble() * 600),
      sleepPerformance: Math.round(86 + progress * 10 + wobble() * 4),
      sleepDurationMinutes: sleepDuration,
      sleepNeedMinutes: 478,
      sleepEfficiencyPercentage: Math.round(90 + progress * 5 + wobble() * 2),
      sleepConsistencyPercentage: Math.round(82 + progress * 9 + wobble() * 3),
      respiratoryRate: round1(14.9 - progress * 0.5 + wobble() * 0.3),
      lightSleepMinutes: sleepDuration - deep - rem,
      deepSleepMinutes: deep,
      remSleepMinutes: rem,
      awakeMinutes: awake,
    });
  }
  return points;
}

/** The latest morning's snapshot — the numbers the big card leads with. */
function demoMetrics(base: Date): WhoopDailyMetrics {
  return {
    recoveryScore: 92,
    strain: 11.4,
    hrvMs: 128,
    restingHeartRate: 43,
    spo2Percentage: 98.4,
    skinTempCelsius: 33.5,
    averageHeartRate: 61,
    maxHeartRate: 174,
    kilojoule: 9_840,
    sleepPerformance: 96,
    sleepDurationMinutes: 462,
    sleepNeedMinutes: 478,
    sleepEfficiencyPercentage: 94,
    sleepConsistencyPercentage: 91,
    respiratoryRate: 14.4,
    lightSleepMinutes: 244,
    deepSleepMinutes: 98,
    remSleepMinutes: 120,
    awakeMinutes: 28,
    history: demoHistory(base),
  };
}

/** A connected WHOOP with a fresh sync stamp and a month of history. */
export function demoWhoopConnection(
  person: Person,
  nowIso: string,
): WhoopConnection {
  const base = new Date(nowIso);
  return {
    person,
    displayName: "You",
    status: "connected",
    lastSyncedAt: new Date(base.getTime() - 12 * 60_000).toISOString(),
    metrics: demoMetrics(base),
  };
}

/* -- progress detail inputs ------------------------------------------------ */

/**
 * Three captures of the same neutral placeholder frame. Swap
 * `public/you-progress.png` for your own photos to make this yours.
 */
export function demoPhotoTimeline(nowIso: string): PhotoTimeline {
  const base = new Date(nowIso);
  const capture = (daysAgo: number, label: string, weight: number) => ({
    id: `you-${daysAgo}`,
    src: "/you-progress.png",
    capturedAt: new Date(base.getTime() - daysAgo * DAY_MS)
      .toISOString()
      .slice(0, 10),
    label,
    source: "Starter demo frame",
    width: 756,
    height: 1340,
    note: null,
    weightKilograms: weight,
    hidden: false,
  });
  return {
    items: [
      capture(60, "DAY 0", 82.4),
      capture(30, "DAY 30", 80.1),
      capture(1, "DAY 59", 78.6),
    ],
    unavailable: null,
  };
}

/** Dated weight entries trending down across the photo window. */
export function demoWeightHistory(
  nowIso: string,
): { date: string; value: number }[] {
  const base = new Date(nowIso);
  const points: { date: string; value: number }[] = [];
  for (let daysAgo = 60; daysAgo >= 1; daysAgo -= 3) {
    const progress = (60 - daysAgo) / 59;
    points.push({
      date: new Date(base.getTime() - daysAgo * DAY_MS)
        .toISOString()
        .slice(0, 10),
      value: round1(82.4 - progress * 3.8),
    });
  }
  return points;
}

/** Completed workouts: a steady five-a-week rhythm inside the window. */
export function demoWorkoutDates(nowIso: string): string[] {
  const base = new Date(nowIso);
  const dates: string[] = [];
  for (let daysAgo = 30; daysAgo >= 1; daysAgo -= 1) {
    // Rest on every 6th and 7th day of the cycle.
    if (daysAgo % 7 === 0 || daysAgo % 7 === 6) continue;
    const stamp = new Date(base.getTime() - daysAgo * DAY_MS);
    stamp.setUTCHours(17, 30, 0, 0);
    dates.push(stamp.toISOString());
  }
  return dates;
}

/** WHOOP's single current body reading, matching the latest weight entry. */
export function demoBodyMeasurement(
  nowIso: string,
): { weightKilograms: number; syncedAt: string } {
  const base = new Date(nowIso);
  return {
    weightKilograms: 78.6,
    syncedAt: new Date(base.getTime() - 12 * 60_000).toISOString(),
  };
}
