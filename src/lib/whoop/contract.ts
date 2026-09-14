export type Person = "luke" | "rowan";

export type WhoopConnectionStatus =
  | "disconnected"
  | "connected"
  | "syncing"
  | "error";

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
  recoveryUserCalibrating?: boolean | null;
  sleepPerformance?: number | null;
  sleepDurationMinutes?: number | null;
  sleepNeedMinutes?: number | null;
  sleepNeedBaselineMinutes?: number | null;
  sleepNeedFromDebtMinutes?: number | null;
  sleepNeedFromRecentStrainMinutes?: number | null;
  sleepNeedFromRecentNapMinutes?: number | null;
  sleepEfficiencyPercentage?: number | null;
  sleepConsistencyPercentage?: number | null;
  respiratoryRate?: number | null;
  lightSleepMinutes?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  awakeMinutes?: number | null;
  sleepNoDataMinutes?: number | null;
  sleepCycleCount?: number | null;
  sleepDisturbanceCount?: number | null;
  latestAvailableAt?: string | null;
  latestCompleteCycleAt?: string | null;
  latestSleepUpdatedAt?: string | null;
  latestRecoveryUpdatedAt?: string | null;
  hasPendingLatestCycle?: boolean;
  history?: WhoopMetricHistoryPoint[];
}

export interface WhoopMetricHistoryPoint {
  recordedAt: string;
  cycleEnd?: string | null;
  cycleScoreState?: string | null;
  cycleUpdatedAt?: string | null;
  sleepUpdatedAt?: string | null;
  recoveryScore: number | null;
  strain: number | null;
  hrvMs: number | null;
  restingHeartRate: number | null;
  spo2Percentage?: number | null;
  skinTempCelsius?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  kilojoule?: number | null;
  recoveryUserCalibrating?: boolean | null;
  sleepPerformance?: number | null;
  sleepDurationMinutes?: number | null;
  sleepNeedMinutes?: number | null;
  sleepNeedBaselineMinutes?: number | null;
  sleepNeedFromDebtMinutes?: number | null;
  sleepNeedFromRecentStrainMinutes?: number | null;
  sleepNeedFromRecentNapMinutes?: number | null;
  sleepEfficiencyPercentage?: number | null;
  sleepConsistencyPercentage?: number | null;
  respiratoryRate?: number | null;
  lightSleepMinutes?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  awakeMinutes?: number | null;
  sleepNoDataMinutes?: number | null;
  sleepCycleCount?: number | null;
  sleepDisturbanceCount?: number | null;
  recoveryUpdatedAt?: string | null;
}

export interface WhoopConnection {
  person: Person;
  displayName: string;
  status: WhoopConnectionStatus;
  lastSyncedAt: string | null;
  errorMessage?: string;
  metrics?: WhoopDailyMetrics | null;
}

export interface WhoopConnectionsResponse {
  connections: Record<Person, WhoopConnection>;
}

export const PEOPLE: readonly Person[] = ["luke", "rowan"];

export function disconnectedConnection(person: Person): WhoopConnection {
  return {
    person,
    displayName: person === "luke" ? "You" : "Partner",
    status: "disconnected",
    lastSyncedAt: null,
  };
}
