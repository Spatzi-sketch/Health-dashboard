"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  buildSocialChartModel,
  chartWindowSummary,
  formatChartDateLong,
  formatChartValueExact,
  nearestPointIndex,
  type SocialChartTimeframe,
} from "@/features/dashboard/social-chart-core";
import type { SocialTrendPoint } from "@/features/dashboard/social-metrics";

import styles from "./social-metrics-core.module.css";

/**
 * The real chart behind a social panel: an SVG line/area of the stored daily
 * series in the panel's platform accent, with a snapping crosshair, an exact
 * date/value tooltip, and a keyboard slider pattern so the same readout is
 * reachable without a pointer.
 *
 * Geometry lives in social-chart-core; this component only renders it and
 * owns the interaction state.
 */
export function SocialSignalChart({
  platformLabel,
  metricLabel,
  series,
  timeframe,
}: {
  platformLabel: string;
  metricLabel: string;
  series: readonly SocialTrendPoint[];
  timeframe: SocialChartTimeframe;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pointerActive, setPointerActive] = useState(false);

  const model = useMemo(
    () => buildSocialChartModel(series, timeframe),
    [series, timeframe],
  );
  const summary = chartWindowSummary(model);
  const lastIndex = model.points.length - 1;
  const selectedIndex =
    activeIndex !== null && activeIndex <= lastIndex ? activeIndex : null;
  const selected = selectedIndex === null ? null : model.points[selectedIndex];

  const moveToFraction = useCallback(
    (clientX: number) => {
      const plot = plotRef.current;
      if (!plot || model.points.length === 0) return;
      const bounds = plot.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const fraction = ((clientX - bounds.left) / bounds.width) * 100;
      setActiveIndex(nearestPointIndex(model.points, fraction));
    },
    [model.points],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      setPointerActive(true);
      moveToFraction(event.clientX);
    },
    [moveToFraction],
  );

  const onPointerLeave = useCallback(() => {
    setPointerActive(false);
    // Keep the selection while the plot is focused so keyboard users are
    // never reset by an incidental pointer exit.
    if (document.activeElement !== plotRef.current) setActiveIndex(null);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (model.points.length === 0) return;
      const current = selectedIndex ?? lastIndex;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        next = Math.max(0, current - 1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        next = Math.min(lastIndex, current + 1);
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = lastIndex;
      } else if (event.key === "Escape") {
        setActiveIndex(null);
        return;
      }
      if (next !== null) {
        event.preventDefault();
        setActiveIndex(next);
      }
    },
    [model.points.length, selectedIndex, lastIndex],
  );

  if (model.empty) {
    return (
      <div className={styles.chartEmpty} role="status">
        <span>{summary}</span>
      </div>
    );
  }

  const valueText = selected
    ? `${formatChartDateLong(selected.date)}: ` +
      `${formatChartValueExact(selected.value)} ${metricLabel.toLowerCase()}`
    : `${model.observedDays} days of ${metricLabel.toLowerCase()}`;
  const tooltipAlign =
    selected === null
      ? "center"
      : selected.x < 18
        ? "start"
        : selected.x > 82
          ? "end"
          : "center";

  return (
    <div className={styles.chartFrame}>
      <div
        ref={plotRef}
        className={styles.chartPlot}
        role="slider"
        tabIndex={0}
        aria-label={`${platformLabel} ${metricLabel} by day`}
        aria-orientation="horizontal"
        aria-readonly="true"
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={selectedIndex ?? lastIndex}
        aria-valuetext={valueText}
        data-hovering={pointerActive || selected ? "true" : undefined}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (activeIndex === null) setActiveIndex(lastIndex);
        }}
        onBlur={() => {
          if (!pointerActive) setActiveIndex(null);
        }}
      >
        <svg
          className={styles.chartSvg}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {model.yTicks.map((tick) => (
            <line
              key={`y-${tick.position}`}
              className={styles.chartGridLine}
              x1="0"
              x2="100"
              y1={tick.position}
              y2={tick.position}
            />
          ))}
          {model.xTicks.map((tick) => (
            <line
              key={`x-${tick.position}`}
              className={styles.chartGridLine}
              x1={tick.position}
              x2={tick.position}
              y1="0"
              y2="100"
            />
          ))}
          {model.areaPath ? (
            <path className={styles.chartArea} d={model.areaPath} />
          ) : null}
          {model.linePath ? (
            <path className={styles.chartLine} d={model.linePath} />
          ) : null}
          {selected ? (
            <line
              className={styles.chartCrosshair}
              x1={selected.x}
              x2={selected.x}
              y1="0"
              y2="100"
            />
          ) : null}
        </svg>

        {selected ? (
          <span
            className={styles.chartMarker}
            style={{ left: `${selected.x}%`, top: `${selected.y}%` }}
            aria-hidden="true"
          />
        ) : null}

        {selected ? (
          <div
            className={styles.chartTooltip}
            data-align={tooltipAlign}
            style={{ left: `${selected.x}%` }}
            aria-hidden="true"
          >
            <strong>{formatChartValueExact(selected.value)}</strong>
            <span>{formatChartDateLong(selected.date).toUpperCase()}</span>
          </div>
        ) : null}

        <div className={styles.chartYLabels} aria-hidden="true">
          {model.yTicks.map((tick) => (
            <span
              key={`${tick.position}-${tick.label}`}
              style={{ top: `${tick.position}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.chartXLabels} aria-hidden="true">
        {model.xTicks.map((tick) => (
          <span
            key={`${tick.position}-${tick.label}`}
            style={{ left: `${tick.position}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

    </div>
  );
}
