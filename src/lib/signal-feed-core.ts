/**
 * Pure helpers for the signal-feed chips (no DOM, no CSS): how old a feed's
 * last sync is, and whether that still counts as LIVE on the daily cadence.
 * The pipeline syncs at 05:00 UTC with retries through 17:00 UTC, so a
 * healthy feed is never older than ~26 hours.
 */

export const LIVE_MAX_HOURS = 26;

export interface FeedAge {
  text: string;
  hours: number | null;
}

export function feedAge(
  syncedAt: string | null,
  referenceTimeIso: string,
): FeedAge {
  if (!syncedAt) return { text: "never", hours: null };
  const at = Date.parse(syncedAt);
  const now = Date.parse(referenceTimeIso);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return { text: "never", hours: null };
  const hours = Math.max(0, (now - at) / 3_600_000);
  if (hours < 1) return { text: "now", hours };
  if (hours < 48) return { text: `${Math.floor(hours)}h ago`, hours };
  return { text: `${Math.floor(hours / 24)}d ago`, hours };
}

export function feedIsLive(age: FeedAge): boolean {
  return age.hours !== null && age.hours < LIVE_MAX_HOURS;
}
