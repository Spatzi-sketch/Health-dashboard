"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AnalyticsHub } from "./analytics-hub";
import {
  useDashboardSurface,
  useProgressSurface,
} from "./dashboard-surfaces";
import { SignalFeedStrip, type SignalFeed } from "./signal-feed-strip";
import { SocialSignalChart } from "./social-signal-chart";
import type { Person } from "@/lib/whoop/contract";
import {
  selectChartWindow,
  type SocialChartTimeframe,
} from "@/features/dashboard/social-chart-core";
import {
  SOCIAL_HEADLINE_RANGES,
  compactSubline,
  contextLine,
  deltaGlyph,
  deltaSubline,
  formatDeltaValue,
  headlineDeltas,
  platformStatusNote,
  type ContextItem,
  type HeadlineDeltaTile,
  type SocialHeadlineRange,
} from "@/features/dashboard/social-headline-deltas";
import {
  SOCIAL_PLATFORM_IDS,
  type SocialContentItem,
  type SocialDashboardMetrics,
  type SocialPlatformId,
  type SocialPlatformMetrics,
  type SocialTrendPoint,
} from "@/features/dashboard/social-metrics";

import styles from "./social-metrics-core.module.css";

export type SocialExtendedSeries = Partial<
  Record<SocialPlatformId, SocialTrendPoint[]>
>;

type RGB = readonly [number, number, number];

type ModuleMode = "chart" | "terrain";

interface TerrainProfile {
  id: SocialPlatformId;
  platform: string;
  metric: string;
  value: string;
  series: readonly SocialTrendPoint[];
  normalizedSeries: readonly number[];
  seed: number;
  speed: number;
  low: RGB;
  high: RGB;
  hot: RGB;
}

const VISUAL_PROFILES: Record<
  SocialPlatformId,
  Pick<TerrainProfile, "seed" | "speed" | "low" | "high" | "hot">
> = {
  youtube: {
    seed: 17,
    speed: 0.42,
    low: [120, 10, 28],
    high: [255, 41, 74],
    hot: [255, 241, 238],
  },
  instagram: {
    seed: 29,
    speed: 0.34,
    low: [84, 26, 138],
    high: [223, 69, 255],
    hot: [255, 172, 72],
  },
  tiktok: {
    seed: 43,
    speed: 0.56,
    low: [0, 95, 113],
    high: [21, 228, 242],
    hot: [225, 254, 255],
  },
};

const MAX_DPR = 1.5;
const TARGET_FRAME_MS = 1000 / 30;
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** The delta window every card shares; 7D is the default lens. */
const DEFAULT_HEADLINE_RANGE: SocialHeadlineRange = 7;

/**
 * The chart follows the shared window. A one-day window still draws the
 * seven-day chart so the newest day has neighbours to be read against.
 */
function chartTimeframeFor(range: SocialHeadlineRange): SocialChartTimeframe {
  return range === 30 ? 30 : 7;
}

function formatCount(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(Math.round(value));
}

function normalizeSeries(points: readonly SocialTrendPoint[]): number[] {
  if (points.length < 2) return [];
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return values.map(() => 0.48);
  return values.map((value) => (value - minimum) / (maximum - minimum));
}

function buildTerrainProfile(platform: SocialPlatformMetrics): TerrainProfile {
  const visual = VISUAL_PROFILES[platform.platform];
  return {
    id: platform.platform,
    platform: platform.platform.toUpperCase(),
    metric: platform.headlineLabel.toUpperCase(),
    value: formatCount(platform.headlineValue),
    series: platform.trend.series,
    normalizedSeries: normalizeSeries(platform.trend.series),
    ...visual,
  };
}

const PROGRESS_FRAMES = [
  {
    person: "luke",
    name: "YOU",
    frame: "PROGRESS FRAME 01",
    src: "/you-progress.png",
    alt: "Your progress photo",
  },
] as const;

function rgba(color: RGB, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function mixColor(from: RGB, to: RGB, amount: number): RGB {
  const t = Math.min(1, Math.max(0, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function hash(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function seriesHeight(profile: TerrainProfile, position: number): number {
  const values = profile.normalizedSeries;
  if (values.length < 2) return 0;
  const cursor = Math.min(1, Math.max(0, position)) * (values.length - 1);
  const left = Math.floor(cursor);
  const right = Math.min(values.length - 1, left + 1);
  const mix = cursor - left;
  return values[left] * (1 - mix) + values[right] * mix;
}

function terrainHeight(
  profile: TerrainProfile,
  u: number,
  depth: number,
  time: number,
): number {
  const breath = Math.sin(time * profile.speed + depth * 2.1) * 0.006;
  const drift = Math.sin(time * profile.speed * 0.38 + depth * 4.4) * 0.006;
  const shifted = u + drift;
  const measured = seriesHeight(profile, shifted);
  const depthShape = 0.4 + Math.sin(depth * Math.PI) * 0.6;
  const mountains = measured * depthShape;
  const ridges =
    Math.sin((u * 13 + depth * 2.8 + time * profile.speed) * Math.PI) *
    (profile.normalizedSeries.length > 1 ? 0.025 : 0.002);
  const micro =
    Math.sin((u * 31 - depth * 5.3 - time * profile.speed * 0.7) * Math.PI) *
    (profile.normalizedSeries.length > 1 ? 0.008 : 0.001);
  return Math.max(
    0,
    mountains + ridges + micro + (profile.normalizedSeries.length > 1 ? breath : 0),
  );
}

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  profile: TerrainProfile,
  time: number,
): void {
  const left = Math.min(176, width * 0.26);
  const right = width - Math.min(96, width * 0.14);
  const top = 20;
  const bottom = height - 22;

  context.save();
  context.lineWidth = 0.55;
  context.strokeStyle = rgba(profile.high, 0.08);
  context.setLineDash([2, 7]);
  for (let x = left; x <= right; x += Math.max(46, (right - left) / 8)) {
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
  for (let y = top; y <= bottom; y += Math.max(30, (bottom - top) / 6)) {
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }
  context.setLineDash([]);

  const scanX = left + ((time * 22 + profile.seed * 13) % (right - left));
  const scan = context.createLinearGradient(scanX - 28, 0, scanX + 28, 0);
  scan.addColorStop(0, rgba(profile.high, 0));
  scan.addColorStop(0.5, rgba(profile.hot, 0.19));
  scan.addColorStop(1, rgba(profile.high, 0));
  context.fillStyle = scan;
  context.fillRect(scanX - 28, top, 56, bottom - top);
  context.restore();
}

function drawDepthDust(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  profile: TerrainProfile,
  time: number,
  plotLeft: number,
  plotWidth: number,
): void {
  if (profile.normalizedSeries.length < 2) return;
  const count = width < 520 ? 110 : 190;

  for (let index = 0; index < count; index += 1) {
    const depth = hash(profile.seed * 173 + index * 47);
    const drift = Math.sin(time * profile.speed * 0.38 + index * 1.91);
    const x =
      plotLeft +
      hash(profile.seed * 347 + index * 97) * plotWidth +
      drift * (2 + depth * 5);
    const y =
      height * (0.2 + hash(profile.seed * 613 + index * 59) * 0.7) +
      Math.cos(time * profile.speed * 0.31 + index * 0.83) *
        (1.5 + depth * 4);
    const flare = Math.pow(
      Math.max(0, Math.sin(time * profile.speed + index * 2.17)),
      9,
    );
    const color = mixColor(
      mixColor(profile.low, profile.high, 0.18 + depth * 0.74),
      profile.hot,
      flare * 0.72,
    );
    const alpha = 0.045 + depth * 0.16 + flare * 0.24;
    const size = 0.45 + depth * 0.72 + flare * 0.55;

    context.fillStyle = rgba(color, alpha);
    context.fillRect(x, y, size, size);
  }
}

function drawTerrain(
  canvas: HTMLCanvasElement,
  profile: TerrainProfile,
  time: number,
): void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height, profile, time);

  const plotLeft = Math.min(170, width * 0.25);
  const plotRight = width - Math.min(94, width * 0.14);
  const plotWidth = Math.max(120, plotRight - plotLeft);
  const rows = width < 520 ? 29 : 39;
  const columns = Math.max(84, Math.min(180, Math.floor(plotWidth / 2.7)));
  const projectedRows: Array<Array<readonly [number, number, number]>> = [];

  context.save();
  context.globalCompositeOperation = "lighter";
  drawDepthDust(
    context,
    width,
    height,
    profile,
    time,
    plotLeft,
    plotWidth,
  );

  for (let row = 0; row < rows; row += 1) {
    const depth = row / Math.max(1, rows - 1);
    const spread = plotWidth * (0.7 + depth * 0.3);
    const center = plotLeft + plotWidth / 2;
    const baseY = height * (0.35 + depth * 0.52);
    const amplitude = height * (0.28 + depth * 0.18);
    const points: Array<readonly [number, number, number]> = [];

    context.beginPath();
    for (let column = 0; column < columns; column += 1) {
      const u = column / Math.max(1, columns - 1);
      const elevation = terrainHeight(profile, u, depth, time);
      const jitter =
        (hash(profile.seed * 1009 + row * 131 + column * 17) - 0.5) *
        (0.8 + depth * 1.2);
      const x = center + (u - 0.5) * spread + jitter;
      const y = baseY - elevation * amplitude + jitter * 0.48;
      points.push([x, y, elevation]);
      if (column === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.strokeStyle = rgba(profile.high, 0.035 + depth * 0.07);
    context.lineWidth = 0.45 + depth * 0.3;
    context.stroke();
    projectedRows.push(points);
  }

  for (let row = 0; row < projectedRows.length; row += 1) {
    const depth = row / Math.max(1, projectedRows.length - 1);
    const perspective = Math.pow(depth, 1.22);
    const points = projectedRows[row];
    for (let column = 0; column < points.length; column += 1) {
      const [x, y, elevation] = points[column];
      const heat = Math.min(1, Math.max(0, elevation * 1.05));
      const base = mixColor(
        profile.low,
        profile.high,
        0.12 + perspective * 0.88,
      );
      const color = mixColor(base, profile.hot, Math.pow(heat, 1.65));
      const flicker =
        0.78 +
        hash(profile.seed * 701 + row * 71 + column * 29) * 0.22;
      const alpha =
        (0.1 + perspective * 0.4 + heat * (0.24 + perspective * 0.2)) *
        flicker;
      const size = 0.42 + perspective * 0.78 + heat * 0.46;
      context.fillStyle = rgba(color, alpha);
      context.fillRect(x, y, size, size);

      if (heat > 0.52 && (column + row) % 3 === 0) {
        context.fillStyle = rgba(
          profile.hot,
          0.12 + perspective * 0.13 + heat * 0.31,
        );
        context.fillRect(x - 0.55, y - 0.55, size + 1.1, size + 1.1);
      }
    }
  }

  for (let row = 4; row < projectedRows.length; row += 5) {
    const current = projectedRows[row];
    const previous = projectedRows[row - 1];
    context.strokeStyle = rgba(profile.high, 0.055);
    context.lineWidth = 0.45;
    for (let column = 7; column < current.length; column += 11) {
      context.beginPath();
      context.moveTo(previous[column][0], previous[column][1]);
      context.lineTo(current[column][0], current[column][1]);
      context.stroke();
    }
  }

  const pulseY = height * (0.26 + ((time * profile.speed * 0.08) % 0.56));
  const pulse = context.createLinearGradient(plotLeft, pulseY, plotRight, pulseY);
  pulse.addColorStop(0, rgba(profile.high, 0));
  pulse.addColorStop(0.5, rgba(profile.hot, 0.22));
  pulse.addColorStop(1, rgba(profile.high, 0));
  context.fillStyle = pulse;
  context.fillRect(plotLeft, pulseY, plotWidth, 0.7);
  context.restore();
}

/**
 * A progress frame as a real control.
 *
 * The frame keeps its exact visual treatment and becomes a button, so it can
 * be reached by keyboard, announces itself properly, and opens that person's
 * Progress Detail through the shared surface coordinator rather than by
 * setting a document attribute of its own.
 */
/**
 * The YouTube panel's title doubles as the analytics entry: pressing it
 * slides the whole page over to the Analytics Hub (the real three-platform
 * social hub), the same one-page journey every surface takes. The b-roll
 * studio remains one clearly-labeled button away on the hub itself.
 */
function StudioEntryTitle({
  profile,
}: {
  profile: { id: string; platform: string };
}) {
  const { surface, open } = useDashboardSurface();
  const active = surface.kind === "analytics";
  return (
    <button
      type="button"
      className={styles.platformOpen}
      id={`social-metric-${profile.id}`}
      aria-expanded={active}
      aria-label="Open the analytics hub"
      onClick={() => open({ kind: "analytics" })}
    >
      {profile.platform}
      <i aria-hidden="true">›</i>
    </button>
  );
}

function ProgressFrameControl({
  person,
  label,
  children,
}: {
  person: Person;
  label: string;
  children: ReactNode;
}) {
  const { active, open } = useProgressSurface(person);
  return (
    <button
      className={styles.progressFrame}
      type="button"
      data-person={person}
      aria-label={label}
      aria-expanded={active}
      onClick={open}
    >
      {children}
    </button>
  );
}

function ProgressDuoStage() {
  return (
    <section
      className={styles.progressStage}
      data-rowzy-social-progress="true"
      aria-label="Progress photo sequence"
    >
      <span className={styles.stageHorizon} aria-hidden="true" />
      <span
        className={styles.launchTrace}
        data-person="luke"
        aria-hidden="true"
      />
      <div className={styles.progressStageInner}>
        {PROGRESS_FRAMES.map((photo, index) => (
          <ProgressFrameControl
            key={photo.person}
            person={photo.person}
            label={`Open ${photo.name} progress detail`}
          >
            <div className={styles.photoViewport}>
              <Image
                className={styles.progressImage}
                src={photo.src}
                alt={photo.alt}
                fill
                priority
                sizes="(max-width: 760px) 46vw, (max-width: 1120px) 44vw, 24vw"
              />
              <span className={styles.photoDepthGlow} aria-hidden="true" />
              <span className={styles.photoScan} aria-hidden="true" />
              <span className={styles.photoReticle} aria-hidden="true" />
            </div>
            <header className={styles.photoMeta}>
              <span>{photo.name}</span>
              <i />
              <span>{photo.frame}</span>
              <b>0{index + 1}</b>
            </header>
          </ProgressFrameControl>
        ))}
      </div>
      <p className={styles.stageCaption}>
        <span>PROGRESS ARRAY</span>
        <i />
        <span>16:9 · CHRONOLOGICAL CAPTURE</span>
      </p>
    </section>
  );
}

function chartMetricLabel(platform: SocialPlatformMetrics): string {
  if (platform.trend.metric === "views") return "DAILY VIEWS";
  if (platform.trend.metric === "reach") return "DAILY REACH";
  if (platform.trend.metric === "audience_count") return "FOLLOWER SNAPSHOTS";
  return platform.platform === "youtube"
    ? "DAILY VIEWS"
    : platform.platform === "instagram"
      ? "DAILY REACH"
      : "FOLLOWER SNAPSHOTS";
}

/**
 * The best recent post, only when it has a title. A raw provider id is
 * never shown to a person.
 */
function topContentCaption(item: SocialContentItem | undefined): string | null {
  if (!item || !item.title) return null;
  const label = item.title.length > 60 ? `${item.title.slice(0, 59)}…` : item.title;
  return item.views === null
    ? label
    : `${label} · ${NUMBER_FORMAT.format(item.views)} views`;
}


function DeltaTile({ tile }: { tile: HeadlineDeltaTile }) {
  const glyph = deltaGlyph(tile);
  const subline = compactSubline(deltaSubline(tile));
  const valueText = formatDeltaValue(tile);
  const description = [
    tile.label,
    tile.rangeLabel,
    valueText,
    subline ?? "",
    ...tile.notes,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      className={styles.deltaTile}
      data-key={tile.key}
      data-sign={tile.sign}
      data-fixed-range={tile.fixedRange ? "true" : undefined}
      aria-label={description}
      title={tile.notes.length ? tile.notes.join(" · ") : undefined}
    >
      <span className={styles.deltaLabel}>
        <span>{tile.label}</span>
        {tile.fixedRange ? (
          // The shared control names the window for every other tile; this
          // pill marks the one that cannot follow it.
          <b
            className={styles.deltaRange}
            title="Only a 30-day total is stored for this metric"
          >
            {tile.rangeLabel}
          </b>
        ) : null}
      </span>
      <strong className={styles.deltaValue}>
        {glyph ? <i aria-hidden="true">{glyph}</i> : null}
        {valueText}
      </strong>
      {subline ? <small className={styles.deltaSub}>{subline}</small> : null}
    </li>
  );
}

function MetricModule({
  profile,
  chartSeries,
  metricLabel,
  topContent,
  canvasRef,
  range,
  tiles,
  context,
  statusNote,
  mode,
  onModeChange,
  demo = false,
}: {
  profile: TerrainProfile;
  chartSeries: readonly SocialTrendPoint[];
  metricLabel: string;
  topContent: string | null;
  canvasRef: (node: HTMLCanvasElement | null) => void;
  range: SocialHeadlineRange;
  tiles: readonly HeadlineDeltaTile[];
  context: readonly ContextItem[];
  statusNote: string | null;
  mode: ModuleMode;
  onModeChange: (mode: ModuleMode) => void;
  /** True while this tile renders demo data; shows the tile's DEMO chip. */
  demo?: boolean;
}) {
  // Everything that is not the number, the tiles or the graph lives in the
  // details drawer: context facts, the tile caveats, the status note and the
  // best titled post. The card itself stays show-not-tell.
  const notes = tiles.flatMap((tile) =>
    tile.notes.map((text) => ({ label: tile.label, text })),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const detailsId = `social-details-${profile.id}`;

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailsOpen(false);
        detailsButtonRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        drawerRef.current?.contains(target) ||
        detailsButtonRef.current?.contains(target)
      ) {
        return;
      }
      setDetailsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [detailsOpen]);

  const hasDetails =
    context.length > 0 || notes.length > 0 || statusNote !== null || topContent !== null;
  // "22/30d" beside the graph title only when the window is incomplete; a
  // full window says nothing.
  const timeframe = chartTimeframeFor(range);
  const observedDays = selectChartWindow(chartSeries, timeframe).length;
  const windowEvidence =
    observedDays > 0 && observedDays < timeframe ? `${observedDays}/${timeframe}d` : null;

  return (
    <article
      className={styles.module}
      data-platform={profile.id}
      data-mode={mode}
      data-details={detailsOpen ? "open" : "closed"}
      aria-labelledby={`social-metric-${profile.id}`}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <span className={styles.moduleGlow} aria-hidden="true" />
      <span className={styles.scanBeam} aria-hidden="true" />
      <span className={styles.corner} data-corner="top-left" aria-hidden="true" />
      <span className={styles.corner} data-corner="bottom-right" aria-hidden="true" />

      <header className={styles.identity}>
        {profile.id === "youtube" ? (
          <StudioEntryTitle profile={profile} />
        ) : (
          <p className={styles.platform} id={`social-metric-${profile.id}`}>
            {profile.platform}
          </p>
        )}
        {demo ? <span className={styles.demoChip}>DEMO</span> : null}
        <p className={styles.metricValue}>{profile.value}</p>
        <p className={styles.metricName}>{profile.metric}</p>
      </header>

      <div className={styles.moduleTop}>
        <ul
          className={styles.deltaRow}
          aria-label={`${profile.platform} change over the selected ${range}D window`}
        >
          {tiles.map((tile) => (
            <DeltaTile key={tile.key} tile={tile} />
          ))}
        </ul>
      </div>

      <div className={styles.lensBar}>
        <p className={styles.lensTitle}>
          <span>{metricLabel}</span>
          {windowEvidence ? <b>{windowEvidence}</b> : null}
        </p>
        <div
          className={styles.controlCluster}
          role="group"
          aria-label={`${profile.platform} view mode`}
        >
          <button
            type="button"
            className={styles.controlButton}
            aria-pressed={mode === "chart"}
            onClick={() => onModeChange("chart")}
          >
            CHART
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-pressed={mode === "terrain"}
            onClick={() => onModeChange("terrain")}
          >
            TERRAIN
          </button>
          {hasDetails ? (
            <button
              ref={detailsButtonRef}
              type="button"
              className={styles.detailsButton}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              DETAILS
              <i aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {mode === "chart" ? (
        <div className={styles.chartLayer}>
          <SocialSignalChart
            platformLabel={profile.platform}
            metricLabel={metricLabel}
            series={chartSeries}
            timeframe={chartTimeframeFor(range)}
          />
        </div>
      ) : (
        <div className={styles.terrainSpace} aria-hidden="true" />
      )}

      {detailsOpen ? (
        <div
          ref={drawerRef}
          id={detailsId}
          className={styles.detailsDrawer}
          role="region"
          aria-label={`${profile.platform} details`}
        >
          <div className={styles.detailsHead}>
            <span>{profile.platform} · details</span>
            <button
              type="button"
              className={styles.detailsClose}
              onClick={() => {
                setDetailsOpen(false);
                detailsButtonRef.current?.focus();
              }}
              aria-label="Close details"
            >
              ×
            </button>
          </div>
          <div className={styles.detailsBody}>
            {context.length > 0 ? (
              <dl className={styles.detailsList}>
                {context.map((item) => (
                  <div key={item.key}>
                    <dt>{item.label}</dt>
                    <dd>
                      {item.value}
                      {item.note ? <small>{item.note}</small> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {topContent ? (
              <p className={styles.detailsLine}>
                <b>Top post</b>
                <span>{topContent}</span>
              </p>
            ) : null}
            {notes.length > 0 ? (
              <ul className={styles.detailsNotes}>
                {notes.map((note) => (
                  <li key={`${note.label}-${note.text}`}>
                    <b>{note.label}</b> {note.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {statusNote ? (
              <p className={styles.statusNote}>{statusNote}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function SocialMetricsCore({
  metrics,
  extendedSeries = null,
  syncFeeds = null,
  referenceTimeIso = null,
  demoPlatforms = null,
}: {
  metrics: SocialDashboardMetrics;
  /**
   * Optional longer (90-day) trend series per platform for the chart
   * timeframes. When absent the charts use the 30-day series and their
   * window captions say how much history actually reported.
   */
  extendedSeries?: SocialExtendedSeries | null;
  /** Last-sync stamps for the feed chips beside the window control. */
  syncFeeds?: readonly SignalFeed[] | null;
  referenceTimeIso?: string | null;
  /**
   * Per-platform demo flags (see features/dashboard/demo-status.ts). A
   * platform marked true wears a DEMO chip on its tile; null hides them all.
   */
  demoPlatforms?: Partial<Record<SocialPlatformId, boolean>> | null;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasesRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const paintRef = useRef<((time: number) => void) | null>(null);
  const [range, setRange] = useState<SocialHeadlineRange>(
    DEFAULT_HEADLINE_RANGE,
  );
  const profiles = useMemo(
    () =>
      SOCIAL_PLATFORM_IDS.map((platform) =>
        buildTerrainProfile(metrics.platforms[platform]),
      ),
    [metrics],
  );
  const chartSeriesByPlatform = useMemo(() => {
    const byPlatform = {} as Record<
      SocialPlatformId,
      readonly SocialTrendPoint[]
    >;
    for (const platform of SOCIAL_PLATFORM_IDS) {
      const extended = extendedSeries?.[platform] ?? [];
      const base = metrics.platforms[platform].trend.series;
      byPlatform[platform] = extended.length >= base.length ? extended : base;
    }
    return byPlatform;
  }, [metrics, extendedSeries]);
  // The chart is the default lens whenever the stored series can draw one;
  // the terrain remains one toggle away. With no drawable history the
  // terrain stays up and the chart mode reports the empty window honestly.
  const [modes, setModes] = useState<Record<SocialPlatformId, ModuleMode>>(
    () => {
      const initial = {} as Record<SocialPlatformId, ModuleMode>;
      for (const platform of SOCIAL_PLATFORM_IDS) {
        initial[platform] =
          chartSeriesByPlatform[platform].length >= 2 ? "chart" : "terrain";
      }
      return initial;
    },
  );
  const modesRef = useRef(modes);
  const deltasByPlatform = useMemo(() => {
    const byPlatform = {} as Record<
      SocialPlatformId,
      ReturnType<typeof headlineDeltas>
    >;
    for (const platform of SOCIAL_PLATFORM_IDS) {
      byPlatform[platform] = headlineDeltas(platform, range, metrics, {
        extendedTrendSeries: chartSeriesByPlatform[platform],
      });
    }
    return byPlatform;
  }, [metrics, range, chartSeriesByPlatform]);
  const contextByPlatform = useMemo(() => {
    const byPlatform = {} as Record<
      SocialPlatformId,
      ReturnType<typeof contextLine>
    >;
    for (const platform of SOCIAL_PLATFORM_IDS) {
      byPlatform[platform] = contextLine(platform, metrics);
    }
    return byPlatform;
  }, [metrics]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const canvases = canvasesRef.current.filter(
      (canvas): canvas is HTMLCanvasElement => Boolean(canvas),
    );
    if (canvases.length !== profiles.length) return;

    let frame = 0;
    let running = false;
    let visible = true;
    const shouldPauseForCinematic = () =>
      document.documentElement.dataset.rowzyCinematic === "active" &&
      ["compare", "tired"].includes(
        document.documentElement.dataset.rowzyCinematicFocus ?? "",
      );
    let cinematicPaused = shouldPauseForCinematic();
    let lastPaint = 0;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // A card in chart mode keeps its canvas mounted (dimmed under the chart)
    // but does not pay for the animation: the loop paints terrain-mode cards
    // only, and chart-mode cards get a single static frame on resize or
    // mode change.
    const paintAll = (time: number, includeChart = false) => {
      canvases.forEach((canvas, index) => {
        if (!includeChart && modesRef.current[profiles[index].id] !== "terrain") return;
        drawTerrain(canvas, profiles[index], time);
      });
    };
    paintRef.current = (time) => paintAll(time, true);

    const animate = (time: number) => {
      if (!running) return;
      const elapsed = time - lastPaint;
      if (elapsed >= TARGET_FRAME_MS - 1) {
        paintAll(time / 1000);
        lastPaint = time - (elapsed % TARGET_FRAME_MS);
      }
      frame = window.requestAnimationFrame(animate);
    };

    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };

    const updateAnimation = () => {
      const shouldRun =
        visible && !document.hidden && !motionQuery.matches && !cinematicPaused;
      if (shouldRun && !running) {
        running = true;
        lastPaint = 0;
        frame = window.requestAnimationFrame(animate);
      } else if (!shouldRun) {
        stop();
        paintAll(1.25, true);
      }
    };

    const resize = () => {
      canvases.forEach(sizeCanvas);
      paintAll(performance.now() / 1000, true);
    };

    const resizeObserver = new ResizeObserver(resize);
    canvases.forEach((canvas) => resizeObserver.observe(canvas));

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        updateAnimation();
      },
      { rootMargin: "180px" },
    );
    intersectionObserver.observe(root);

    const onVisibilityChange = () => updateAnimation();
    const onMotionChange = () => updateAnimation();
    const onCinematicChange = () => {
      cinematicPaused = shouldPauseForCinematic();
      updateAnimation();
    };
    const onCinematicStage = () => {
      cinematicPaused = shouldPauseForCinematic();
      updateAnimation();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionChange);
    window.addEventListener("rowzy:cinematic-change", onCinematicChange);
    window.addEventListener("rowzy:cinematic-stage", onCinematicStage);

    resize();
    updateAnimation();

    return () => {
      stop();
      paintRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("rowzy:cinematic-change", onCinematicChange);
      window.removeEventListener("rowzy:cinematic-stage", onCinematicStage);
    };
  }, [profiles]);

  // Switching a card back to terrain paints it at once, so a paused loop
  // (reduced motion, hidden tab) never leaves a blank canvas behind.
  useEffect(() => {
    modesRef.current = modes;
    paintRef.current?.(performance.now() / 1000);
  }, [modes]);

  return (
    <>
    <section
      ref={rootRef}
      className={styles.core}
      data-rowzy-cinematic-panel="social"
      aria-label="Social performance dashboard"
    >
      <div
        className={styles.coreHeader}
        data-rowzy-social-chrome="true"
        aria-hidden="true"
      >
        <span>SOCIAL SIGNAL ARRAY</span>
        <i />
        <span>NORMALIZED DATABASE</span>
      </div>
      <ProgressDuoStage />
      <div className={styles.rangeBar}>
        <span className={styles.rangeBarLabel} id="social-range-label">
          CHANGE WINDOW
        </span>
        <div
          className={styles.rangeControl}
          role="group"
          aria-labelledby="social-range-label"
        >
          {SOCIAL_HEADLINE_RANGES.map((days) => (
            <button
              key={days}
              type="button"
              className={styles.rangeButton}
              aria-pressed={range === days}
              onClick={() => setRange(days)}
            >
              {days}D
            </button>
          ))}
        </div>
        {syncFeeds && referenceTimeIso ? (
          <div className={styles.rangeBarFeeds}>
            <SignalFeedStrip feeds={syncFeeds} referenceTimeIso={referenceTimeIso} />
          </div>
        ) : null}
      </div>
      <div className={styles.signalStack} data-rowzy-social-stack="true">
        {profiles.map((profile, index) => (
          <MetricModule
            key={profile.id}
            profile={profile}
            chartSeries={chartSeriesByPlatform[profile.id]}
            metricLabel={chartMetricLabel(metrics.platforms[profile.id])}
            topContent={topContentCaption(
              metrics.platforms[profile.id].content.items[0],
            )}
            range={range}
            tiles={deltasByPlatform[profile.id].tiles}
            context={contextByPlatform[profile.id]}
            statusNote={platformStatusNote(metrics.platforms[profile.id])}
            mode={modes[profile.id]}
            onModeChange={(mode) =>
              setModes((current) =>
                current[profile.id] === mode
                  ? current
                  : { ...current, [profile.id]: mode },
              )
            }
            canvasRef={(node) => {
              canvasesRef.current[index] = node;
            }}
            demo={demoPlatforms?.[profile.id] === true}
          />
        ))}
      </div>
    </section>
    {/* The Analytics Hub surface region rides the same server data this
        panel already receives, as a sibling grid region — page.tsx stays
        untouched and the shared coordinator decides when it shows. */}
    <AnalyticsHub metrics={metrics} extendedSeries={extendedSeries} />
    </>
  );
}
