/**
 * Typed fixture data for the WHOOP connection card.
 * In the starter these entries back the dev-only connection-state switcher;
 * the default dashboard state uses the richer demo connection instead.
 */

export const WHOOP_CONNECTION_STATUSES = [
  "disconnected",
  "connected",
  "syncing",
  "error",
] as const;

export type WhoopConnectionStatus = (typeof WHOOP_CONNECTION_STATUSES)[number];

export type Person = "luke" | "rowan";

/** Safe, normalized values that may be rendered in the shared dashboard. */
export interface WhoopDailyMetrics {
  recoveryScore: number | null;
  strain: number | null;
  hrvMs: number | null;
  restingHeartRate: number | null;
  spo2Percentage?: number | null;
  skinTempCelsius?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  kilojoule?: number | null;
  sleepPerformance?: number | null;
  sleepDurationMinutes?: number | null;
  sleepNeedMinutes?: number | null;
  sleepEfficiencyPercentage?: number | null;
  sleepConsistencyPercentage?: number | null;
  respiratoryRate?: number | null;
  lightSleepMinutes?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  awakeMinutes?: number | null;
  history?: WhoopMetricHistoryPoint[];
}

export interface WhoopMetricHistoryPoint {
  recordedAt: string;
  recoveryScore: number | null;
  strain: number | null;
  hrvMs: number | null;
  restingHeartRate: number | null;
  spo2Percentage?: number | null;
  skinTempCelsius?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  kilojoule?: number | null;
  sleepPerformance?: number | null;
  sleepDurationMinutes?: number | null;
  sleepNeedMinutes?: number | null;
  sleepEfficiencyPercentage?: number | null;
  sleepConsistencyPercentage?: number | null;
  respiratoryRate?: number | null;
  lightSleepMinutes?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  awakeMinutes?: number | null;
}

export interface WhoopConnection {
  person: Person;
  displayName: string;
  status: WhoopConnectionStatus;
  /** ISO timestamp of the last successful sync; null = never synced. */
  lastSyncedAt: string | null;
  /** Present only when status is "error". */
  errorMessage?: string;
  /** Latest successful daily snapshot; never contains provider IDs or tokens. */
  metrics?: WhoopDailyMetrics | null;
}

export function isWhoopConnectionStatus(
  value: string,
): value is WhoopConnectionStatus {
  return (WHOOP_CONNECTION_STATUSES as readonly string[]).includes(value);
}

/** Fixed timestamps keep server rendering deterministic. */
const LUKE_LAST_SYNC = "2026-08-05T14:32:00Z";
const ROWAN_LAST_SYNC = "2026-08-05T11:07:00Z";

export const whoopConnectionFixtures: Record<
  Person,
  Record<WhoopConnectionStatus, WhoopConnection>
> = {
  luke: {
    disconnected: {
      person: "luke",
      displayName: "You",
      status: "disconnected",
      lastSyncedAt: null,
    },
    connected: {
      person: "luke",
      displayName: "You",
      status: "connected",
      lastSyncedAt: LUKE_LAST_SYNC,
      metrics: {
        recoveryScore: 81,
        strain: 8.7,
        hrvMs: 72,
        restingHeartRate: 48,
      },
    },
    syncing: {
      person: "luke",
      displayName: "You",
      status: "syncing",
      lastSyncedAt: LUKE_LAST_SYNC,
    },
    error: {
      person: "luke",
      displayName: "You",
      status: "error",
      lastSyncedAt: null,
      errorMessage: "WHOOP authorization expired.",
    },
  },
  rowan: {
    disconnected: {
      person: "rowan",
      displayName: "Partner",
      status: "disconnected",
      lastSyncedAt: null,
    },
    connected: {
      person: "rowan",
      displayName: "Partner",
      status: "connected",
      lastSyncedAt: ROWAN_LAST_SYNC,
      metrics: {
        recoveryScore: 69,
        strain: 10.2,
        hrvMs: 61,
        restingHeartRate: 52,
      },
    },
    syncing: {
      person: "rowan",
      displayName: "Partner",
      status: "syncing",
      lastSyncedAt: ROWAN_LAST_SYNC,
    },
    error: {
      person: "rowan",
      displayName: "Partner",
      status: "error",
      lastSyncedAt: ROWAN_LAST_SYNC,
      errorMessage: "Last sync attempt failed.",
    },
  },
};

const lastSyncedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** "Never" when there has been no successful sync. */
export function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never";
  return lastSyncedFormatter.format(new Date(lastSyncedAt));
}
