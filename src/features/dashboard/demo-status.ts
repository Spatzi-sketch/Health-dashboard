/**
 * Which tiles are still rendering demo data.
 *
 * This is the ONE file a connect-agent edits when it wires a tile to real
 * data: flip that tile's flag to false and the tile's DEMO chip disappears.
 * The header chip reads SIMULATED FEED only while every tile is still demo;
 * as soon as one tile is real, the header chip goes away and only the
 * remaining demo tiles stay labelled.
 *
 * See SETUP-AGENT.md ("Wiring guide") for the per-tile connection contract.
 */

export interface DemoTileStatus {
  youtube: boolean;
  instagram: boolean;
  tiktok: boolean;
  whoop: boolean;
  /**
   * Amazfit demo status is managed client-side (its data lives in the
   * browser's localStorage — see features/dashboard/amazfit.ts), so it is
   * declared here for completeness but excluded from the header
   * `allTilesDemo` check below.
   */
  amazfit: boolean;
}

export const demoTileStatus: DemoTileStatus = {
  youtube: true,
  instagram: true,
  tiktok: true,
  whoop: true,
  amazfit: true,
};

/** True while every server-rendered tile still shows demo data. */
export function allTilesDemo(status: DemoTileStatus): boolean {
  return status.youtube && status.instagram && status.tiktok && status.whoop;
}
