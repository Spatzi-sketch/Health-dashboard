/**
 * Amazfit / Zepp health data — types, demo generator and import parser.
 *
 * Amazfit (Zepp) exposes no public OAuth API for third-party personal
 * dashboards, so the honest connection path is a local data import:
 *
 *   1. In the Zepp app: Profile → Security & Privacy → User Rights →
 *      Export Data (a GDPR-style export you receive by email), then
 *   2. Import the JSON/CSV into this dashboard via the Amazfit card.
 *
 * Imported data is stored in the browser's localStorage under
 * `AMAZFIT_STORAGE_KEY` — it never leaves the device. Until an import is
 * present the card renders clearly-labelled demo data (same honesty rule as
 * every other tile: see features/dashboard/demo-status.ts).
 */

export const AMAZFIT_STORAGE_KEY = "rowzy:amazfit:metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AmazfitDay {
  /** Normalized YYYY-MM-DD. */
  date: string;
  steps: number | null;
  distanceMeters: number | null;
  /** Kilocalories. */
  calories: number | null;
  /** Average heart rate, bpm. */
  heartRate: number | null;
  restingHeartRate: number | null;
  sleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  /** Personal Activity Intelligence (0–~150+). */
  pai: number | null;
  /** Blood oxygen, %. */
  spo2: number | null;
  /** Stress level (1–100). */
  stress: number | null;
}

export interface AmazfitMetrics {
  source: "demo" | "import";
  importedAt: string | null;
  days: AmazfitDay[];
}

export type AmazfitField = Exclude<keyof AmazfitDay, "date">;

const FIELDS: AmazfitField[] = [
  "steps",
  "distanceMeters",
  "calories",
  "heartRate",
  "restingHeartRate",
  "sleepMinutes",
  "deepSleepMinutes",
  "remSleepMinutes",
  "pai",
  "spo2",
  "stress",
];

function finiteOrNull(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The most recent day (highest date string). */
export function latestDay(days: AmazfitDay[]): AmazfitDay | null {
  if (days.length === 0) return null;
  return days.reduce((latest, day) => (day.date > latest.date ? day : latest));
}

/** A single-metric history array across days (oldest → newest). */
export function fieldHistory(
  days: AmazfitDay[],
  field: AmazfitField,
): number[] {
  return days
    .map((day) => day[field])
    .filter((value): value is number => value !== null);
}

/* -- demo data ------------------------------------------------------------ */

function wobble(amplitude: number, seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 * amplitude - amplitude;
}

function demoDay(date: Date, seed: number): AmazfitDay {
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const steps = Math.round(8_200 + (weekend ? 2_400 : 0) + wobble(1_600, seed));
  const sleepMinutes = Math.round(430 + wobble(50, seed + 1));
  const deep = Math.round(sleepMinutes * (0.2 + wobble(0.04, seed + 2)));
  const rem = Math.round(sleepMinutes * (0.22 + wobble(0.05, seed + 3)));
  return {
    date: date.toISOString().slice(0, 10),
    steps,
    distanceMeters: Math.round(steps * 0.75),
    calories: Math.round(steps * 0.045 + wobble(40, seed + 4)),
    heartRate: Math.round(74 + wobble(6, seed + 5)),
    restingHeartRate: Math.round(58 + wobble(3, seed + 6)),
    sleepMinutes,
    deepSleepMinutes: Math.max(0, deep),
    remSleepMinutes: Math.max(0, rem),
    pai: Math.round(52 + wobble(18, seed + 7)),
    spo2: round1(97.1 + wobble(0.9, seed + 8)),
    stress: Math.round(38 + wobble(12, seed + 9)),
  };
}

export function demoAmazfitMetrics(nowIso: string): AmazfitMetrics {
  const base = new Date(nowIso);
  const days: AmazfitDay[] = [];
  for (let daysAgo = 30; daysAgo >= 1; daysAgo -= 1) {
    days.push(
      demoDay(new Date(base.getTime() - daysAgo * DAY_MS), daysAgo * 7),
    );
  }
  return { source: "demo", importedAt: null, days };
}

/* -- import parsing ------------------------------------------------------- */

function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // YYYY-MM-DD (also tolerates ISO datetimes).
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // YYYY/MM/DD
  const slash = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(value);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;

  // DD.MM.YYYY or DD/MM/YYYY
  const eu = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(value);
  if (eu) {
    const day = eu[1].padStart(2, "0");
    const month = eu[2].padStart(2, "0");
    return `${eu[3]}-${month}-${day}`;
  }

  return null;
}

function normalizeDay(input: Record<string, unknown>): AmazfitDay | null {
  const date = normalizeDate(String(input.date ?? input.day ?? ""));
  if (!date) return null;

  const day: AmazfitDay = {
    date,
    steps: finiteOrNull(input.steps),
    distanceMeters: finiteOrNull(input.distanceMeters ?? input.distance),
    calories: finiteOrNull(input.calories ?? input.kcal),
    heartRate: finiteOrNull(input.heartRate ?? input.avgHeartRate),
    restingHeartRate: finiteOrNull(
      input.restingHeartRate ?? input.restingHeartRateBpm,
    ),
    sleepMinutes: finiteOrNull(input.sleepMinutes ?? input.sleep),
    deepSleepMinutes: finiteOrNull(input.deepSleepMinutes ?? input.deepSleep),
    remSleepMinutes: finiteOrNull(input.remSleepMinutes ?? input.remSleep),
    pai: finiteOrNull(input.pai),
    spo2: finiteOrNull(input.spo2 ?? input.bloodOxygen),
    stress: finiteOrNull(input.stress),
  };

  // Reject rows that carry no measurable value at all.
  if (FIELDS.every((field) => day[field] === null)) return null;
  return day;
}

interface CsvColumn {
  field: AmazfitField;
  /** Multiply raw numbers by this (e.g. km → m, hours → minutes). */
  scale: number;
}

const CSV_COLUMNS: { field: AmazfitField; test: RegExp; scale: number }[] = [
  { field: "steps", test: /step/i, scale: 1 },
  { field: "distanceMeters", test: /distance/i, scale: 1 },
  { field: "calories", test: /calor|kcal/i, scale: 1 },
  { field: "heartRate", test: /avg.*heart|heart.*avg|heart.?rate|heart rate/i, scale: 1 },
  { field: "restingHeartRate", test: /resting/i, scale: 1 },
  { field: "sleepMinutes", test: /sleep/i, scale: 1 },
  { field: "deepSleepMinutes", test: /deep/i, scale: 1 },
  { field: "remSleepMinutes", test: /rem/i, scale: 1 },
  { field: "pai", test: /^pai$/i, scale: 1 },
  { field: "spo2", test: /spo2|oxygen|o2/i, scale: 1 },
  { field: "stress", test: /stress/i, scale: 1 },
];

function parseCsv(text: string): AmazfitDay[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  const headers = lines[0].split(/[,;\t]/).map((h) => h.trim());
  const dateIndex = headers.findIndex((h) => /date|day|time/i.test(h));
  if (dateIndex === -1) return null;

  // Map header positions to fields, detecting km/hours scale hints.
  const columns: (CsvColumn & { index: number })[] = [];
  headers.forEach((header, index) => {
    if (index === dateIndex) return;
    for (const column of CSV_COLUMNS) {
      if (column.test.test(header)) {
        let scale = column.scale;
        if (column.field === "distanceMeters" && /km/i.test(header)) {
          scale = 1000;
        }
        if (
          (column.field === "sleepMinutes" ||
            column.field === "deepSleepMinutes" ||
            column.field === "remSleepMinutes") &&
          /hour|hr/i.test(header)
        ) {
          scale = 60;
        }
        columns.push({ field: column.field, scale, index });
        break;
      }
    }
  });
  if (columns.length === 0) return null;

  const days: AmazfitDay[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(/[,;\t]/).map((c) => c.trim());
    const date = normalizeDate(cells[dateIndex] ?? "");
    if (!date) continue;

    const record: Record<string, unknown> = { date };
    for (const column of columns) {
      const raw = finiteOrNull(cells[column.index]);
      if (raw !== null) {
        record[column.field] = raw * column.scale;
      }
    }
    const day = normalizeDay(record);
    if (day) days.push(day);
  }
  return days.length > 0 ? days : null;
}

/**
 * Parse a user-supplied import (JSON or CSV) into normalized days.
 * Returns null when the input cannot be recognized.
 */
export function parseAmazfitImport(text: string): AmazfitDay[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // CSV (has a header row we can detect).
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return parseCsv(trimmed);
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const candidate = Array.isArray(parsed) ? parsed : extractDayList(parsed);
    if (!Array.isArray(candidate)) return null;
    const days = candidate
      .map((item) =>
        normalizeDay(item as Record<string, unknown>),
      )
      .filter((day): day is AmazfitDay => day !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    return days.length > 0 ? days : null;
  } catch {
    return null;
  }
}

function extractDayList(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.days)) return object.days;
  if (Array.isArray(object.data)) return object.data;
  if (Array.isArray(object.records)) return object.records;
  // A single-day object.
  if (typeof object.date === "string") return [object];
  return null;
}
