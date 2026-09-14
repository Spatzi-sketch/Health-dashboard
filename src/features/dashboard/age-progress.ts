const DAY_MS = 86_400_000;

/** Demo birth date — replace with your own to make the orbit dial yours. */
export const TWINS_BIRTH_DATE = Object.freeze({
  year: 2000,
  month: 1,
  day: 15,
});

export const TWINS_TIME_ZONE = "UTC";

const MONTH_LABELS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface AgeCycleProgress {
  age: number;
  targetAge: number;
  cycleStartedOn: string;
  targetDate: string;
  daysElapsed: number;
  daysRemaining: number;
  daysInCycle: number;
  progress: number;
  progressPercent: number;
  remainingPercent: number;
}

function calendarDateInTimeZone(
  instant: Date,
  timeZone: string,
): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function compareMonthDay(left: CalendarDate, right: CalendarDate): number {
  return left.month === right.month
    ? left.day - right.day
    : left.month - right.month;
}

function utcDay(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function isoDate(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month
    .toString()
    .padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}

export function formatAgeTargetDate(targetDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(targetDate);
  if (!match) throw new TypeError("A valid ISO target date is required.");

  const [, year, rawMonth, rawDay] = match;
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const monthLabel = MONTH_LABELS[month - 1];
  if (!monthLabel || day < 1 || day > 31) {
    throw new TypeError("A valid ISO target date is required.");
  }

  return `${day} ${monthLabel} ${year}`;
}

export function calculateAgeCycleProgress(
  asOf: Date = new Date(),
  birthDate: CalendarDate = TWINS_BIRTH_DATE,
  timeZone = TWINS_TIME_ZONE,
): AgeCycleProgress {
  if (!Number.isFinite(asOf.getTime())) {
    throw new TypeError("A valid date is required to calculate age progress.");
  }

  const current = calendarDateInTimeZone(asOf, timeZone);
  const birthdayThisYear = { ...birthDate, year: current.year };
  const age =
    current.year -
    birthDate.year -
    (compareMonthDay(current, birthdayThisYear) < 0 ? 1 : 0);
  const cycleStart = { ...birthDate, year: birthDate.year + age };
  const cycleTarget = { ...birthDate, year: cycleStart.year + 1 };
  const startMs = utcDay(cycleStart);
  const targetMs = utcDay(cycleTarget);
  const currentMs = utcDay(current);
  const daysInCycle = Math.round((targetMs - startMs) / DAY_MS);
  const daysElapsed = Math.max(
    0,
    Math.min(daysInCycle, Math.floor((currentMs - startMs) / DAY_MS)),
  );
  const daysRemaining = Math.max(
    0,
    Math.min(daysInCycle, Math.ceil((targetMs - currentMs) / DAY_MS)),
  );
  const progress = daysInCycle > 0 ? daysElapsed / daysInCycle : 0;

  return {
    age,
    targetAge: age + 1,
    cycleStartedOn: isoDate(cycleStart),
    targetDate: isoDate(cycleTarget),
    daysElapsed,
    daysRemaining,
    daysInCycle,
    progress,
    progressPercent: Math.round(progress * 1_000) / 10,
    remainingPercent: Math.round((1 - progress) * 1_000) / 10,
  };
}
