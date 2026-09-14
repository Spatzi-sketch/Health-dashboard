"use client";

/**
 * RETENTION THEATRE — design-lab section 20 promoted into the Analytics Hub.
 *
 * Three instruments, one story: the retention curve as a lit vein, exit
 * density along the runtime, and the views → subscribers flow band. The data
 * honesty is the point and lives in buildRetentionTheatreModel:
 *
 * - the per-second CURVE and the exit-density BINS are not in the store, so
 *   they always render the lab's fixture series under the lab's own
 *   FIXTURE SERIES chip, with insights phrased as what they WOULD show;
 * - the HEADLINE strip and the FLOW band read the real YouTube 30-day store
 *   totals wherever they exist, under the hub's SYNCED STORE chip; a stage
 *   the store cannot back renders the awaiting treatment (a gap in the band,
 *   never a fixture number);
 * - the footer names exactly which instruments await real data.
 *
 * Scrubbing is the lab's: the range input drives the readout, and hovering
 * the curve moves the same scrub line. CSS/SVG only; the global
 * reduced-motion clamp covers the one draw animation.
 */

import { useMemo, useState, type PointerEvent, type ReactNode } from "react";

import {
  RETENTION_CLIFF,
  RETENTION_CURVE,
  RETENTION_EXITS,
  RETENTION_META,
} from "@/app/design-lab/fixtures";
import {
  RETENTION_SOURCE_CHIPS,
  buildRetentionTheatreModel,
  formatRetentionClock,
  type HubSource,
  type RetentionFlowStageModel,
} from "@/features/dashboard/analytics-hub";
import type { SocialDashboardMetrics } from "@/features/dashboard/social-metrics";

import styles from "./retention-theatre.module.css";

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

function Corners({ className }: { className: string }) {
  return (
    <>
      {CORNERS.map((corner) => (
        <span key={corner} className={className} data-corner={corner} aria-hidden />
      ))}
    </>
  );
}

/* -- curve geometry (fixture → SVG space), ported from the lab --------------- */

const CURVE_W = 640;
const CURVE_H = 170;
const CURVE_X0 = 10;
const CURVE_X1 = 630;
const CURVE_Y0 = 12;
const CURVE_Y1 = 150;

const toX = (t: number) =>
  CURVE_X0 + (t / RETENTION_META.durationS) * (CURVE_X1 - CURVE_X0);
const toY = (pct: number) => CURVE_Y1 - (pct / 100) * (CURVE_Y1 - CURVE_Y0);

const CURVE_PATH = RETENTION_CURVE.map(
  (point, index) =>
    `${index === 0 ? "M" : "L"}${toX(point.t).toFixed(2)} ${toY(point.pct).toFixed(2)}`,
).join(" ");

const CURVE_AREA = `${CURVE_PATH} L${CURVE_X1} ${CURVE_Y1} L${CURVE_X0} ${CURVE_Y1} Z`;

/** Linear interpolation of the fixture curve at second t. */
function pctAt(t: number): number {
  const points = RETENTION_CURVE;
  if (t <= points[0].t) return points[0].pct;
  for (let i = 1; i < points.length; i += 1) {
    if (t <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.t - a.t || 1;
      return a.pct + ((t - a.t) / span) * (b.pct - a.pct);
    }
  }
  return points[points.length - 1].pct;
}

/* -- flow geometry, computed per render from the honest stage list ----------- */

const FLOW_W = 640;
const FLOW_H = 150;
const FLOW_CY = 66;
const FLOW_BAR_W = 7;
const FLOW_MAX_H = 112;

interface FlowGeometry {
  bars: { id: string; x: number; h: number }[];
  bands: { id: string; path: string; opacity: number }[];
  /** Awaiting stages draw a dashed gap marker instead of a bar. */
  gaps: { id: string; x: number }[];
}

function flowGeometry(
  stages: readonly RetentionFlowStageModel[],
): FlowGeometry {
  const slots = stages.map((stage, index) => ({
    stage,
    x: 10 + (index / (stages.length - 1)) * (FLOW_W - 20 - FLOW_BAR_W),
    h:
      stage.share !== null
        ? Math.max(4, (stage.share / 100) * FLOW_MAX_H)
        : null,
  }));
  const bands: FlowGeometry["bands"] = [];
  for (let index = 0; index < slots.length - 1; index += 1) {
    const from = slots[index];
    const to = slots[index + 1];
    // A band only ever connects two measured (or two fixture) bars; an
    // awaiting stage leaves an honest gap in the flow.
    if (from.h === null || to.h === null) continue;
    const x1 = from.x + FLOW_BAR_W;
    const x2 = to.x;
    const bend = (x2 - x1) * 0.45;
    const topA = FLOW_CY - from.h / 2;
    const topB = FLOW_CY - to.h / 2;
    const botA = FLOW_CY + from.h / 2;
    const botB = FLOW_CY + to.h / 2;
    bands.push({
      id: `${from.stage.id}-${to.stage.id}`,
      path:
        `M${x1} ${topA} C${x1 + bend} ${topA}, ${x2 - bend} ${topB}, ${x2} ${topB} ` +
        `L${x2} ${botB} C${x2 - bend} ${botB}, ${x1 + bend} ${botA}, ${x1} ${botA} Z`,
      opacity: 0.16 - index * 0.04,
    });
  }
  return {
    bars: slots.flatMap((slot) =>
      slot.h === null ? [] : [{ id: slot.stage.id, x: slot.x, h: slot.h }],
    ),
    bands,
    gaps: slots
      .filter((slot) => slot.h === null)
      .map((slot) => ({ id: slot.stage.id, x: slot.x })),
  };
}

/* -- panel shell -------------------------------------------------------------- */

function TheatrePanel({
  title,
  source,
  insight,
  children,
}: {
  title: string;
  source: HubSource;
  insight: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <Corners className={styles.panelCorner} />
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        <span className={styles.sourceChip} data-source={source}>
          {RETENTION_SOURCE_CHIPS[source]}
        </span>
      </header>
      {children}
      <p className={styles.insight}>{insight}</p>
    </div>
  );
}

/* -- the section --------------------------------------------------------------- */

export function RetentionTheatre({
  metrics,
}: {
  metrics: SocialDashboardMetrics;
}) {
  const model = useMemo(() => buildRetentionTheatreModel(metrics), [metrics]);
  const [scrub, setScrub] = useState<number>(RETENTION_CLIFF.t);
  const scrubPct = pctAt(scrub);
  const flow = flowGeometry(model.flow.stages);

  /** Hovering the curve scrubs it; the range input is the accessible control. */
  function scrubFromPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const ratio = (event.clientX - bounds.left) / bounds.width;
    const t = Math.round(
      Math.min(1, Math.max(0, ratio)) * RETENTION_META.durationS,
    );
    setScrub(t);
  }

  return (
    <section className={styles.theatre} aria-label="Retention theatre">
      <header className={styles.head}>
        <div className={styles.headTitle}>
          <h3>RETENTION THEATRE</h3>
          <p>{model.headline.context}</p>
        </div>
        <div className={styles.headStats}>
          {model.headline.stats.map((stat) => (
            <span key={stat.label} className={styles.headStat}>
              {stat.label} <b className="tnum">{stat.value}</b>
              <small>{stat.detail}</small>
            </span>
          ))}
          <span className={styles.sourceChip} data-source={model.headline.source}>
            {RETENTION_SOURCE_CHIPS[model.headline.source]}
          </span>
        </div>
      </header>

      <TheatrePanel
        title="AUDIENCE RETENTION · THE LIT VEIN"
        source={model.curve.source}
        insight={model.curve.insight}
      >
        {model.curve.context ? (
          <span className={styles.fixtureContext}>{model.curve.context}</span>
        ) : null}
        <div className={styles.curveWrap}>
          <svg
            className={styles.curve}
            viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
            preserveAspectRatio="none"
            onPointerMove={scrubFromPointer}
            aria-hidden
          >
            <g className={styles.curveGrid}>
              {[25, 50, 75].map((pct) => (
                <line
                  key={pct}
                  x1={CURVE_X0}
                  y1={toY(pct)}
                  x2={CURVE_X1}
                  y2={toY(pct)}
                />
              ))}
            </g>
            <path className={styles.curveArea} d={CURVE_AREA} />
            <path className={styles.curveVein} d={CURVE_PATH} pathLength={100} />
            <line
              className={styles.cliffLine}
              x1={toX(RETENTION_CLIFF.t)}
              y1={CURVE_Y0}
              x2={toX(RETENTION_CLIFF.t)}
              y2={CURVE_Y1}
            />
            <line
              className={styles.scrubLine}
              x1={toX(scrub)}
              y1={CURVE_Y0}
              x2={toX(scrub)}
              y2={CURVE_Y1}
            />
            <circle
              className={styles.scrubDot}
              cx={toX(scrub)}
              cy={toY(scrubPct)}
              r={3}
            />
          </svg>

          <div
            className={styles.cliffTag}
            style={{ left: `${(toX(RETENTION_CLIFF.t) / CURVE_W) * 100}%` }}
          >
            <Corners className={styles.tagCorner} />
            <b>{RETENTION_CLIFF.label}</b>
            <span className="tnum">
              {RETENTION_CLIFF.from} → {RETENTION_CLIFF.to}
            </span>
          </div>
        </div>

        <div className={styles.scrubRow}>
          <input
            className={styles.scrubInput}
            type="range"
            min={0}
            max={RETENTION_META.durationS}
            step={1}
            value={scrub}
            onChange={(event) => setScrub(Number(event.target.value))}
            aria-label="Scrub the fixture retention curve"
          />
          <span className={`${styles.scrubReadout} tnum`}>
            {formatRetentionClock(scrub)} · {scrubPct.toFixed(0)}% STILL WATCHING
          </span>
        </div>
      </TheatrePanel>

      <TheatrePanel
        title="WHERE THEY LEFT · EXIT DENSITY"
        source={model.exits.source}
        insight={model.exits.insight}
      >
        <div
          className={styles.exitStrip}
          role="img"
          aria-label="Exit density strip, fixture data"
        >
          {RETENTION_EXITS.cells.map((level, index) => (
            <i key={index} className={styles.exitCell} data-level={level} aria-hidden />
          ))}
        </div>
        <div className={styles.beatRail} aria-hidden>
          {RETENTION_EXITS.beats.map((beat) => (
            <span
              key={beat.label}
              className={styles.beat}
              style={{ left: `${(beat.at / RETENTION_EXITS.cells.length) * 100}%` }}
            >
              <i aria-hidden />
              {beat.label}
            </span>
          ))}
        </div>
        <div className={styles.exitScale}>
          <span className="tnum">0:00</span>
          <span>20-SECOND BINS</span>
          <span className="tnum">{RETENTION_META.duration}</span>
        </div>
      </TheatrePanel>

      <TheatrePanel
        title="SUBSCRIBER FLOW · VIEWS → SUBS"
        source={model.flow.source}
        insight={model.flow.insight}
      >
        <svg
          className={styles.flow}
          viewBox={`0 0 ${FLOW_W} ${FLOW_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {flow.bands.map((band) => (
            <path
              key={band.id}
              className={styles.flowBand}
              d={band.path}
              style={{ opacity: band.opacity }}
            />
          ))}
          {flow.bars.map((bar) => (
            <rect
              key={bar.id}
              className={styles.flowBar}
              x={bar.x}
              y={FLOW_CY - bar.h / 2}
              width={FLOW_BAR_W}
              height={bar.h}
            />
          ))}
          {flow.gaps.map((gap) => (
            <line
              key={gap.id}
              className={styles.flowGap}
              x1={gap.x + FLOW_BAR_W / 2}
              y1={FLOW_CY - FLOW_MAX_H / 2}
              x2={gap.x + FLOW_BAR_W / 2}
              y2={FLOW_CY + FLOW_MAX_H / 2}
            />
          ))}
        </svg>
        <div className={styles.flowLabels}>
          {model.flow.stages.map((stage) => (
            <div
              key={stage.id}
              className={styles.flowLabel}
              data-state={stage.state}
            >
              <span>{stage.label}</span>
              <b className="tnum">{stage.value}</b>
              <small>{stage.note}</small>
            </div>
          ))}
        </div>
      </TheatrePanel>

      <footer className={styles.foot}>
        <p>{model.awaiting}</p>
      </footer>
    </section>
  );
}
