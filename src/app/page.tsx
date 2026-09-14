import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { ClapMode } from "@/components/clap-mode";
import { DashboardSurfaceProvider } from "@/components/dashboard-surfaces";
import { MissionDeckNav } from "@/components/mission-deck-nav";
import { ProgressDetail } from "@/components/progress-detail";
import { SocialMetricsCore } from "@/components/social-metrics-core";
import { WhoopConnectionCard } from "@/components/whoop-connection-card";
import { AmazfitConnectionCard } from "@/components/amazfit-connection-card";
import {
  WHOOP_CONNECTION_STATUSES,
  isWhoopConnectionStatus,
  whoopConnectionFixtures,
  type Person,
  type WhoopConnectionStatus,
} from "@/features/dashboard/whoop-fixtures";
import {
  demoSocialDashboardMetrics,
  demoSocialExtendedSeries,
} from "@/features/dashboard/demo-social";
import {
  allTilesDemo,
  demoTileStatus,
} from "@/features/dashboard/demo-status";
import {
  demoBodyMeasurement,
  demoPhotoTimeline,
  demoWeightHistory,
  demoWhoopConnection,
  demoWorkoutDates,
} from "@/features/dashboard/demo-whoop";
import { buildPersonProgress } from "@/features/dashboard/person-progress";
import styles from "./page.module.css";

/**
 * The ROWZY starter renders one person — you. The production dashboard
 * renders two rails from live WHOOP and social stores behind a login; here
 * every number is demo data and the whole page works with zero keys.
 * The internal person key stays "luke" because the shared surface and
 * cinematic CSS key on it; only the display layer says YOU.
 */
const YOU: Person = "luke";
const PEOPLE: readonly Person[] = [YOU];

const PARTICLES = [
  [4, 68, 1.4, 34, -9, -82], [9, 93, 1.8, 45, 12, -101],
  [15, 76, 1.2, 27, -4, -72], [20, 88, 2.1, 39, 8, -96],
  [26, 63, 1.5, 48, -13, -108], [31, 97, 2.2, 31, 5, -68],
  [37, 72, 1.3, 43, 14, -91], [42, 84, 1.9, 25, -7, -78],
  [48, 91, 1.4, 52, 10, -106], [53, 66, 2, 36, -11, -87],
  [58, 79, 1.2, 29, 3, -99], [63, 95, 1.7, 46, 13, -73],
  [68, 70, 2.2, 33, -5, -104], [73, 86, 1.5, 50, 7, -84],
  [78, 62, 1.3, 28, -12, -94], [82, 98, 2, 42, 11, -109],
  [86, 75, 1.6, 37, -3, -76], [90, 90, 1.2, 54, 9, -102],
  [94, 67, 2.1, 30, -14, -89], [98, 83, 1.4, 47, 4, -69],
  [12, 61, 1.9, 35, 13, -97], [34, 81, 1.3, 51, -8, -80],
  [56, 87, 1.8, 26, 6, -107], [76, 93, 1.5, 44, -10, -74],
] as const;
export const dynamic = "force-dynamic";

function resolveStatus(
  raw: string | string[] | undefined,
): WhoopConnectionStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && isWhoopConnectionStatus(value) ? value : null;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const syncResult = Array.isArray(params.sync) ? params.sync[0] : params.sync;
  const showSwitcher = process.env.NODE_ENV === "development";
  const requestedStatus = showSwitcher ? resolveStatus(params.you) : null;

  const nowIso = new Date().toISOString();
  // The dev-only switcher previews the other card states from the fixture
  // set; the resting state is always the rich, connected demo.
  const connection =
    requestedStatus && requestedStatus !== "connected"
      ? whoopConnectionFixtures[YOU][requestedStatus]
      : demoWhoopConnection(YOU, nowIso);
  const socialMetrics = demoSocialDashboardMetrics(nowIso);
  const socialSeries = demoSocialExtendedSeries(nowIso);
  const progress = buildPersonProgress({
    person: YOU,
    displayName: "You",
    connection,
    socialMetrics,
    photos: demoPhotoTimeline(nowIso),
    bodyMeasurement: demoBodyMeasurement(nowIso),
    weightHistory: demoWeightHistory(nowIso),
    workoutDates: demoWorkoutDates(nowIso),
    generatedAt: nowIso,
  });

  return (
    <DashboardSurfaceProvider>
    <div className={styles.shell}>
      <DashboardHeader simulated={allTilesDemo(demoTileStatus)} />
      <DashboardBackdrop />

      {syncResult === "complete" || syncResult === "failed" ? (
        <p
          className={
            syncResult === "complete"
              ? styles.syncNotice
              : `${styles.syncNotice} ${styles.syncNoticeError}`
          }
          role={syncResult === "failed" ? "alert" : "status"}
        >
          {syncResult === "complete"
            ? "WHOOP data synced."
            : "WHOOP sync could not finish. Try again shortly."}
        </p>
      ) : null}

      <main className={styles.split} data-rowzy-dashboard-grid="true">
        {PEOPLE.map((person) => (
          <Fragment key={person}>
            <section
              className={styles.panel}
              data-person={person}
              data-rowzy-cinematic-panel={`whoop-${person}`}
              aria-label={`${connection.displayName} panel`}
            >
              <WhoopConnectionCard
                connection={connection}
                canManage
                referenceTimeIso={nowIso}
                demo={demoTileStatus.whoop}
              />
              <AmazfitConnectionCard referenceTimeIso={nowIso} />
            </section>
            <SocialMetricsCore
              metrics={socialMetrics}
              extendedSeries={socialSeries}
              referenceTimeIso={nowIso}
              demoPlatforms={{
                youtube: demoTileStatus.youtube,
                instagram: demoTileStatus.instagram,
                tiktok: demoTileStatus.tiktok,
              }}
              syncFeeds={[
                ...(["youtube", "instagram", "tiktok"] as const).map(
                  (platform) => ({
                    id: platform,
                    syncedAt: socialMetrics.platforms[platform].lastSyncedAt,
                  }),
                ),
                {
                  id: "whoop" as const,
                  syncedAt: connection.lastSyncedAt,
                },
              ]}
            />
            {/* Every expanded surface is a region of this same grid, so
                opening one re-proportions the dashboard in place instead of
                mounting a modal over it or navigating away. The shared
                coordinator keeps exactly one of them active. See the reflow
                rules in globals.css. */}
            <ProgressDetail person={person} progress={progress} />
          </Fragment>
        ))}
      </main>

      {/* Mission-Control navigation: a deliberate upward over-scroll past the
          top of the page (or of an open surface's scroller) opens a deck of
          every room; tiles travel through the same surface provider above.
          Mounted here as a sibling overlay so the provider stays untouched. */}
      <MissionDeckNav />

      {showSwitcher ? (
        <nav
          className={styles.switcher}
          aria-label="Mock state preview (development only)"
        >
          <span className={styles.switcherHint}>Preview states</span>
          <div className={styles.switcherGroup}>
            <span className={styles.switcherLabel}>you</span>
            {WHOOP_CONNECTION_STATUSES.map((status) => {
              const active =
                status === (requestedStatus ?? "connected");
              return (
                <Link
                  key={status}
                  href={`/?you=${status}`}
                  className={
                    active
                      ? `${styles.switcherLink} ${styles.switcherLinkActive}`
                      : styles.switcherLink
                  }
                  aria-current={active ? "true" : undefined}
                >
                  {status}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
    </DashboardSurfaceProvider>
  );
}

function DashboardBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.atmosphere} />
      <svg
        className={styles.mountains}
        viewBox="0 0 1600 420"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="rowzy-mountain-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
            <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
            <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
          </linearGradient>
          <linearGradient id="rowzy-mountain-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
            <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
            <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path
          d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z"
          fill="url(#rowzy-mountain-far)"
        />
        <path
          d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z"
          fill="url(#rowzy-mountain-near)"
        />
      </svg>
      <div className={styles.particles}>
        {PARTICLES.map(([left, top, size, duration, dx, dy], index) => (
          <span
            key={`${left}-${top}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${duration}s`,
              animationDelay: `${index * -1.35}s`,
              "--dx": `${dx}px`,
              "--dy": `${dy}vh`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className={styles.grain} />
    </div>
  );
}

function DashboardHeader({ simulated }: { simulated: boolean }) {
  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <Image
          src="/rowzy-diamond.png"
          alt=""
          width={26}
          height={26}
          priority
        />
        <h1 className={styles.brandName}>ROWZY</h1>
        <ClapMode variant="header" />
      </div>
      {/* The production build has a Sign out button here. The starter has no
          account: while EVERY tile still renders demo data the slot says so;
          once any tile is wired for real (see demo-status.ts) this header
          chip retires and only the remaining demo tiles stay labelled. */}
      {simulated ? (
        <span className={styles.signOutButton}>SIMULATED FEED</span>
      ) : null}
    </header>
  );
}
