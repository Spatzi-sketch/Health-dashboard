"use client";

/**
 * The Analytics Hub surface — the design-lab section 16 layout promoted to
 * the real page behind the dashboard's YouTube panel.
 *
 * Opened by the social panel's title button, it expands into the central
 * dashboard area through the shared surface coordinator, exactly the way the
 * YouTube studio does; the b-roll studio itself stays one clearly-labeled
 * button away. Every panel states its source: SYNCED STORE panels render the
 * real synced social store (per-platform 30-day totals, daily series, the
 * latest per-item capture), and any panel the store cannot back yet — the
 * best-time-to-post model, platforms with nothing synced — keeps the
 * design-lab's labeled FIXTURE SNAPSHOT treatment. Fixture numbers never
 * render outside a FIXTURE SNAPSHOT panel.
 *
 * Interactive graphs reuse SocialSignalChart, so hover, keyboard readout and
 * timeframe behaviour match the rest of the app.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  SOCIAL_CHART_TIMEFRAMES,
  type SocialChartTimeframe,
} from "@/features/dashboard/social-chart-core";
import {
  HUB_SOURCE_CHIPS,
  buildAnalyticsHubModel,
  type HubOverlaySeriesModel,
  type HubPlatformColumnModel,
  type HubSource,
} from "@/features/dashboard/analytics-hub";
import type {
  SocialDashboardMetrics,
  SocialPlatformId,
  SocialTrendPoint,
} from "@/features/dashboard/social-metrics";
import { HUB_HEATMAP } from "@/app/design-lab/fixtures";
import { BACK_TO_DASHBOARD_LABEL } from "@/lib/dashboard/surfaces";

import { useDashboardSurface } from "./dashboard-surfaces";
import { RetentionTheatre } from "./retention-theatre";
import { SocialSignalChart } from "./social-signal-chart";
import type { SocialExtendedSeries } from "./social-metrics-core";
import styles from "./analytics-hub.module.css";

/**
 * The accent pair SocialSignalChart reads (the same custom-property contract
 * the social panels set per platform in social-metrics-core.module.css).
 */
const CHART_ACCENTS: Record<
  SocialPlatformId | "combined",
  { rgb: string; hot: string }
> = {
  youtube: { rgb: "255 47 77", hot: "255 238 236" },
  instagram: { rgb: "214 77 255", hot: "255 173 79" },
  tiktok: { rgb: "25 230 241", hot: "225 254 255" },
  combined: { rgb: "110 231 183", hot: "236 255 247" },
};

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

function Corners() {
  return (
    <>
      {CORNERS.map((corner) => (
        <span
          key={corner}
          className={styles.moduleCorner}
          data-corner={corner}
          aria-hidden
        />
      ))}
    </>
  );
}

function linePath(
  values: readonly number[],
  width: number,
  height: number,
  insetX = 4,
  insetY = 5,
): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values
    .map((value, index) => {
      const x = insetX + (index / (values.length - 1)) * (width - insetX * 2);
      const y =
        height - insetY - ((value - min) / spread) * (height - insetY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function accentStyle(rgb: string): CSSProperties {
  return { "--accent": `rgb(${rgb})` } as CSSProperties;
}

function HubPanel({
  title,
  source,
  accent,
  children,
}: {
  title: ReactNode;
  source: HubSource;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.hubPanel}
      style={accent ? accentStyle(accent) : undefined}
    >
      <Corners />
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        <span className={styles.sourceChip} data-source={source}>
          {HUB_SOURCE_CHIPS[source]}
        </span>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </div>
  );
}

function Spark({ values }: { values: readonly number[] }) {
  const path = linePath(values, 120, 26);
  if (!path) return null;
  return (
    <svg
      className={styles.metricSpark}
      viewBox="0 0 120 26"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path} pathLength={100} />
    </svg>
  );
}

/** SocialSignalChart with the accent contract it expects and a real height. */
function ChartHost({
  accent,
  size,
  platformLabel,
  metricLabel,
  series,
  timeframe,
}: {
  accent: SocialPlatformId | "combined";
  size?: "hero";
  platformLabel: string;
  metricLabel: string;
  series: readonly SocialTrendPoint[];
  timeframe: SocialChartTimeframe;
}) {
  const pair = CHART_ACCENTS[accent];
  return (
    <div
      className={styles.chartHost}
      data-size={size}
      style={
        {
          "--module-rgb": pair.rgb,
          "--module-hot-rgb": pair.hot,
        } as CSSProperties
      }
    >
      <SocialSignalChart
        platformLabel={platformLabel}
        metricLabel={metricLabel}
        series={series}
        timeframe={timeframe}
      />
    </div>
  );
}

function PlatformColumn({
  column,
  timeframe,
}: {
  column: HubPlatformColumnModel;
  timeframe: SocialChartTimeframe;
}) {
  return (
    <HubPanel
      accent={column.rgb}
      source={column.source}
      title={
        <span className={styles.platformTitle}>
          <i className={styles.accentDot} aria-hidden />
          {column.label}
        </span>
      }
    >
      <div className={styles.audienceBlock}>
        <span>{column.audienceLabel}</span>
        <strong className="tnum">{column.audience}</strong>
        {column.audienceDelta ? (
          <small className={styles.metricDelta} data-tone={column.audienceTone}>
            {column.audienceDelta}
          </small>
        ) : null}
        {column.statusNote ? (
          <span className={styles.statusNote}>{column.statusNote}</span>
        ) : null}
      </div>
      {column.source === "live" ? (
        <ChartHost
          accent={column.id}
          platformLabel={column.label}
          metricLabel={column.chartMetricLabel}
          series={column.chartSeries}
          timeframe={timeframe}
        />
      ) : null}
      <div className={styles.metricTable}>
        {column.metrics.map((metric) =>
          metric.series.length > 0 ? (
            <div key={metric.label} className={styles.metricRow}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <b className={`${styles.metricValue} tnum`}>{metric.value}</b>
              <Spark values={metric.series} />
              <span className={styles.metricDelta} data-tone={metric.tone}>
                {metric.note}
              </span>
            </div>
          ) : (
            <div key={metric.label} className={styles.metricRow}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.awaiting}>
                {metric.value === "—"
                  ? `AWAITING HISTORY · ${metric.note}`
                  : `${metric.value} · ${metric.note}`}
              </span>
            </div>
          ),
        )}
      </div>
    </HubPanel>
  );
}

function OverlayPanel({
  source,
  series,
  note,
}: {
  source: HubSource;
  series: readonly HubOverlaySeriesModel[];
  note: string;
}) {
  const paths = series.map((entry) => ({
    entry,
    path: linePath(entry.values, 640, 150, 6, 9),
  }));
  return (
    <HubPanel title="PLATFORM OVERLAY · NORMALIZED" source={source}>
      <svg
        className={styles.overlay}
        viewBox="0 0 640 150"
        preserveAspectRatio="none"
        aria-hidden
      >
        <g className={styles.sparkGrid}>
          <line x1="6" y1="38" x2="634" y2="38" />
          <line x1="6" y1="75" x2="634" y2="75" />
          <line x1="6" y1="112" x2="634" y2="112" />
        </g>
        {paths.map(({ entry, path }) =>
          path ? (
            <path
              key={entry.id}
              className={styles.overlayPath}
              style={accentStyle(entry.rgb)}
              d={path}
              pathLength={100}
            />
          ) : null,
        )}
      </svg>
      <div className={styles.legend}>
        {series.map((entry) => (
          <span
            key={entry.id}
            className={styles.legendItem}
            style={accentStyle(entry.rgb)}
          >
            <i className={styles.legendSwatch} aria-hidden />
            {entry.code} · {entry.label.toUpperCase()}
            {entry.values.length < 2 ? " · AWAITING" : ""}
          </span>
        ))}
        <span className={styles.legendNote}>{note}</span>
      </div>
    </HubPanel>
  );
}

/** The 7×24 model panel — still the labeled fixture until a real model syncs. */
function BestTimePanel() {
  return (
    <HubPanel title="BEST TIME TO POST" source="fixture">
      <div className={styles.heatmap}>
        <div className={styles.heatRow} data-scale aria-hidden>
          <span className={styles.heatDay} />
          <span className={styles.heatHour} style={{ gridColumn: "2 / span 6" }}>
            00
          </span>
          <span className={styles.heatHour} style={{ gridColumn: "8 / span 6" }}>
            06
          </span>
          <span className={styles.heatHour} style={{ gridColumn: "14 / span 6" }}>
            12
          </span>
          <span className={styles.heatHour} style={{ gridColumn: "20 / span 6" }}>
            18
          </span>
        </div>
        {HUB_HEATMAP.days.map((day, dayIndex) => (
          <div key={day} className={styles.heatRow}>
            <span className={styles.heatDay}>{day}</span>
            {HUB_HEATMAP.rows[dayIndex].map((level, hour) => (
              <i
                key={hour}
                className={styles.heatCell}
                data-level={level}
                aria-hidden
              />
            ))}
          </div>
        ))}
        <div className={styles.heatLegend}>
          <span>LOW</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i
              key={level}
              className={styles.heatCell}
              data-level={level}
              aria-hidden
            />
          ))}
          <span>HIGH</span>
          <span className={styles.legendNote}>
            FIXTURE MODEL FROM POST-LEVEL ENGAGEMENT · NOT LIVE
          </span>
        </div>
      </div>
    </HubPanel>
  );
}

export function AnalyticsHub({
  metrics,
  extendedSeries = null,
}: {
  metrics: SocialDashboardMetrics;
  extendedSeries?: SocialExtendedSeries | null;
}) {
  const { surface, open, close } = useDashboardSurface();
  const active = surface.kind === "analytics";
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [timeframe, setTimeframe] = useState<SocialChartTimeframe>(30);

  useEffect(() => {
    if (active) backRef.current?.focus({ preventScroll: true });
  }, [active]);

  const model = useMemo(
    () => buildAnalyticsHubModel(metrics, extendedSeries),
    [metrics, extendedSeries],
  );
  const heroFixturePath = linePath(model.hero.fixtureSeries, 320, 64, 5, 7);

  return (
    <section
      className={styles.region}
      data-rowzy-surface-region="analytics"
      aria-label="Analytics hub"
      aria-hidden={active ? undefined : true}
      inert={!active}
    >
      <header className={styles.header}>
        <div className={styles.pageTitle}>
          <span className={styles.pageMark} aria-hidden />
          <h2>ROWZY ANALYTICS</h2>
          <p>SOCIAL HUB · YOUTUBE + INSTAGRAM + TIKTOK</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerButton}
            aria-label="Open the b-roll studio"
            onClick={() => open({ kind: "youtube" })}
          >
            B-ROLL STUDIO
          </button>
          <button
            ref={backRef}
            type="button"
            className={styles.headerButton}
            onClick={close}
          >
            {BACK_TO_DASHBOARD_LABEL}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.windowBar}>
          <span className={styles.windowLabel} id="analytics-hub-window">
            CHART WINDOW
          </span>
          <div
            className={styles.windowControl}
            role="group"
            aria-labelledby="analytics-hub-window"
          >
            {SOCIAL_CHART_TIMEFRAMES.map((days) => (
              <button
                key={days}
                type="button"
                className={styles.windowButton}
                aria-pressed={timeframe === days}
                onClick={() => setTimeframe(days)}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>

        {/* Hero strip */}
        <HubPanel title="AUDIENCE · ALL PLATFORMS" source={model.hero.source}>
          <div className={styles.hero}>
            <div className={styles.heroTotal}>
              <span>TOTAL AUDIENCE</span>
              <strong className="tnum">{model.hero.total}</strong>
              <small>{model.hero.totalNote}</small>
            </div>
            <div className={styles.heroTrend}>
              {model.hero.source === "live" ? (
                <ChartHost
                  accent="combined"
                  size="hero"
                  platformLabel="All platforms"
                  metricLabel="COMBINED AUDIENCE"
                  series={model.hero.combinedSeries}
                  timeframe={timeframe}
                />
              ) : (
                <>
                  <span className={styles.heroTrendLabel}>
                    COMBINED AUDIENCE · {model.hero.fixtureWindow}
                  </span>
                  <svg
                    className={styles.heroSpark}
                    viewBox="0 0 320 64"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <g className={styles.sparkGrid}>
                      <line x1="5" y1="16" x2="315" y2="16" />
                      <line x1="5" y1="32" x2="315" y2="32" />
                      <line x1="5" y1="48" x2="315" y2="48" />
                    </g>
                    <path d={heroFixturePath} pathLength={100} />
                  </svg>
                </>
              )}
            </div>
            <div className={styles.heroChips}>
              {model.hero.chips.map((chip) => (
                <span
                  key={chip.id}
                  className={styles.heroChip}
                  style={accentStyle(chip.rgb)}
                >
                  <i className={styles.accentDot} aria-hidden />
                  <b>{chip.code}</b>
                  <span className="tnum">{chip.text}</span>
                </span>
              ))}
            </div>
          </div>
        </HubPanel>

        {/* Per-platform columns */}
        <div className={styles.platformGrid}>
          {model.platforms.map((column) => (
            <PlatformColumn
              key={column.id}
              column={column}
              timeframe={timeframe}
            />
          ))}
        </div>

        {/* Top content */}
        <HubPanel title="TOP CONTENT · 30D" source={model.topContent.source}>
          <div className={styles.contentGrid}>
            {model.topContent.columns.map((column) => (
              <div
                key={column.id}
                className={styles.contentCol}
                style={accentStyle(column.rgb)}
              >
                <span className={styles.contentColHead}>
                  <i className={styles.accentDot} aria-hidden />
                  {column.label.toUpperCase()}
                </span>
                {column.emptyNote ? (
                  <span className={styles.contentEmpty}>{column.emptyNote}</span>
                ) : null}
                {column.items.map((item, index) => (
                  <article key={item.title} className={styles.contentCard}>
                    {CORNERS.map((corner) => (
                      <span
                        key={corner}
                        className={styles.cardCorner}
                        data-corner={corner}
                        aria-hidden
                      />
                    ))}
                    <span className={`${styles.contentRank} tnum`}>
                      0{index + 1}
                    </span>
                    <span className={styles.contentTitle}>{item.title}</span>
                    <span className={styles.contentStats}>
                      <span>
                        <b className="tnum">{item.views}</b> VIEWS
                      </span>
                      <span>
                        <b className="tnum">{item.likes}</b> LIKES
                      </span>
                      <span>
                        <b className="tnum">{item.comments}</b> COMM
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </HubPanel>

        {/* Retention theatre — headline and flow read the store; the curve and
            exit bins stay the lab's labeled fixtures until retention sync */}
        <RetentionTheatre metrics={metrics} />

        {/* Comparative overlay */}
        <OverlayPanel
          source={model.overlay.source}
          series={model.overlay.series}
          note={model.overlay.note}
        />

        {/* Best time to post — honestly still the fixture model */}
        <BestTimePanel />

        {/* Footer captions */}
        <dl className={styles.hubCaptions}>
          <div>
            <dt>SYNCED PLATFORMS</dt>
            <dd className="tnum">{model.syncedCount}/3</dd>
          </div>
          <div>
            <dt>AUDIENCE TOTAL</dt>
            <dd className="tnum">
              {model.hero.source === "fixture"
                ? `${model.hero.total} · FIXTURE`
                : model.hero.total}
            </dd>
          </div>
          <div>
            <dt>WINDOW</dt>
            <dd>30 DAYS</dd>
          </div>
        </dl>

        <footer className={styles.pageFoot}>
          <p>
            {model.syncedCount === 0
              ? "FIXTURE SNAPSHOT · NO PLATFORM IS SYNCED YET — EVERY PANEL SHOWS LABELED DEMO DATA"
              : "SYNCED STORE PANELS READ THE SOCIAL DATABASE · FIXTURE SNAPSHOT PANELS ARE LABELED DEMO DATA"}
          </p>
        </footer>
      </div>
    </section>
  );
}
