"use client";

/**
 * One person's Progress Detail.
 *
 * A simplified, readable view of real connected data — not a dump of every
 * stored field. The honesty rules it enforces visually:
 *
 *  - A series with no connected source keeps its track and reads N/A or NOT
 *    CONNECTED. It never gets a drawn line.
 *  - A single measurement is shown as a value with its date, never as a trend.
 *  - Lines break across missing days rather than joining over a gap, so an
 *    interval with no data cannot read as a smooth change.
 *  - Series with different units get their own synchronized track sharing only
 *    the date axis. Nothing is plotted on a shared numerical scale it does not
 *    belong to.
 *  - Every figure carries its unit, its date and where it came from.
 *
 * It is a region of the dashboard grid, not a dialog: opening it reflows the
 * page in place and Escape or Back returns the operator to exactly where they
 * were. One person is shown at a time and their data is never combined.
 */

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  METRIC_UNAVAILABLE_DETAIL,
  METRIC_UNAVAILABLE_LABELS,
  contiguousRuns,
  type KnownVariable,
  type PersonProgress,
  type PhotoTimelineItem,
  type ProgressHeadline,
  type ProgressMetricSeries,
} from "@/features/dashboard/person-progress";
import { BACK_TO_DASHBOARD_LABEL } from "@/lib/dashboard/surfaces";
import type { Person } from "@/lib/whoop/contract";
import { useDashboardSurface } from "./dashboard-surfaces";
import styles from "./progress-detail.module.css";

const COUNT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const DECIMAL_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatDate(value: string | null): string {
  if (!value) return "NO DATE";
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value,
  );
  if (!Number.isFinite(parsed)) return "NO DATE";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(parsed))
    .toUpperCase();
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value,
  );
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(parsed))
    .toUpperCase();
}

function formatSigned(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${DECIMAL_FORMAT.format(rounded)}`;
}

interface Plot {
  runs: string[];
  gapCount: number;
  min: number;
  max: number;
}

/**
 * Plot one track.
 *
 * `domain` is the shared date range across every track, so the tracks line up
 * vertically — the same x position is the same day in all of them. The y scale
 * stays local to the track, because these series do not share a unit.
 */
function plotSeries(
  series: ProgressMetricSeries,
  domain: { start: number; end: number },
): Plot | null {
  // The data layer has already decided whether this is drawable, so the
  // renderer never has to make that judgement a second time.
  if (series.unavailable) return null;
  const points = series.points;
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const timeSpan = domain.end - domain.start || 1;

  const allRuns = contiguousRuns(points);
  const runs = allRuns
    // A single orphaned sample cannot be a line segment; it is left out of the
    // path rather than drawn as a mark pretending to be a trend.
    .filter((run) => run.length >= 2)
    .map((run) =>
      run
        .map((point, index) => {
          const time = Date.parse(`${point.date}T00:00:00.000Z`);
          const x = ((time - domain.start) / timeSpan) * 100;
          const y = 26 - ((point.value - min) / span) * 22;
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" "),
    );

  return { runs, gapCount: Math.max(0, allRuns.length - 1), min, max };
}

function SeriesTrack({
  series,
  domain,
}: {
  series: ProgressMetricSeries;
  domain: { start: number; end: number } | null;
}) {
  const plot = useMemo(
    () => (domain ? plotSeries(series, domain) : null),
    [domain, series],
  );
  const reason = series.unavailable ?? (plot ? null : "insufficient_history");

  return (
    <div className={styles.track} data-series={series.id}>
      <div className={styles.trackHead}>
        <span
          className={styles.legendKey}
          data-series={series.id}
          data-unavailable={reason ?? "none"}
          aria-hidden="true"
        />
        <span className={styles.trackLabel}>{series.label}</span>
        {series.unit ? <i className={styles.trackUnit}>{series.unit}</i> : null}
        <span className={styles.trackRange}>
          {plot
            ? `${DECIMAL_FORMAT.format(plot.min)}–${DECIMAL_FORMAT.format(plot.max)}${series.unit}`
            : METRIC_UNAVAILABLE_LABELS[reason!]}
        </span>
      </div>

      {plot ? (
        <svg
          className={styles.trackChart}
          viewBox="0 0 100 28"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${series.label} between ${DECIMAL_FORMAT.format(plot.min)} and ${DECIMAL_FORMAT.format(plot.max)} ${series.unit}`}
        >
          {plot.runs.map((path) => (
            <path key={path} className={styles.trackLine} d={path} />
          ))}
        </svg>
      ) : (
        <p className={styles.trackEmpty} data-reason={reason ?? "none"}>
          {METRIC_UNAVAILABLE_DETAIL[reason!]}
          {series.latest ? (
            <b>
              {" "}
              LAST MEASURED {DECIMAL_FORMAT.format(series.latest.value)}
              {series.unit} · {formatDate(series.latest.date)}
            </b>
          ) : null}
        </p>
      )}

      {plot && plot.gapCount > 0 ? (
        <p className={styles.gapNotice}>
          {plot.gapCount} missing interval{plot.gapCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

function HeadlineTile({ metric }: { metric: ProgressHeadline }) {
  const available = metric.value !== null;
  return (
    <div className={styles.headlineTile} data-available={available}>
      <p className={styles.headlineLabel}>{metric.label}</p>
      <p className={styles.headlineValue}>
        {available
          ? (metric.display ??
            (Math.abs(metric.value!) >= 1000
              ? COUNT_FORMAT.format(metric.value!)
              : DECIMAL_FORMAT.format(metric.value!)))
          : "N/A"}
        {available && metric.unit ? <i>{metric.unit}</i> : null}
      </p>
      <p className={styles.headlineMeta}>
        {available && metric.verifiedAt
          ? `VERIFIED ${formatShortDate(metric.verifiedAt)}`
          : "NOT MEASURED"}
      </p>
    </div>
  );
}

function ComparisonFrame({
  title,
  item,
}: {
  title: string;
  item: PhotoTimelineItem | null;
}) {
  return (
    <article className={styles.comparisonFrame}>
      <p className={styles.comparisonTitle}>{title}</p>
      <p className={styles.comparisonDate}>{formatDate(item?.capturedAt ?? null)}</p>
      <div className={styles.comparisonImage}>
        {item && item.src && !item.hidden ? (
          <Image
            src={item.src}
            alt={`${title} progress photo`}
            width={item.width}
            height={item.height}
            sizes="(max-width: 860px) 44vw, 18vw"
          />
        ) : (
          <p className={styles.privatePlaceholder}>
            <span aria-hidden="true">◱</span>
            {item ? "PRIVATE PHOTO HIDDEN" : "NO CAPTURE"}
          </p>
        )}
      </div>
      <dl className={styles.comparisonMeta}>
        <dt>WEIGHT</dt>
        <dd>
          {item?.weightKilograms === null || item?.weightKilograms === undefined
            ? "N/A"
            : `${DECIMAL_FORMAT.format(item.weightKilograms)} KG`}
        </dd>
        <dt>PRIVATE NOTE</dt>
        <dd className={styles.comparisonNote}>
          {item?.note ?? "No note recorded."}
        </dd>
      </dl>
    </article>
  );
}

export function ProgressDetail({
  person,
  progress,
}: {
  person: Person;
  progress: PersonProgress | null;
}) {
  const { surface, close } = useDashboardSurface();
  const active = surface.kind === "progress" && surface.person === person;
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() =>
      backRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  // Reopening starts at the newest frame rather than wherever the last visit
  // left off. Reset during render, so no stale frame is ever painted.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setPhotoIndex(0);
  }

  const photos = progress?.photos.items ?? [];
  const selectedPhoto = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))];

  // The shared date axis: every track is plotted against the same window, so
  // the same horizontal position means the same day in all of them.
  const domain = useMemo(() => {
    const times = (progress?.timeline ?? [])
      .flatMap((series) => series.points)
      .map((point) => Date.parse(`${point.date}T00:00:00.000Z`))
      .filter((time) => Number.isFinite(time));
    if (times.length < 2) return null;
    return { start: Math.min(...times), end: Math.max(...times) };
  }, [progress?.timeline]);

  const knownGroups = useMemo(() => {
    const groups = new Map<string, KnownVariable[]>();
    for (const variable of progress?.knownVariables ?? []) {
      groups.set(variable.group, [
        ...(groups.get(variable.group) ?? []),
        variable,
      ]);
    }
    return [...groups.entries()];
  }, [progress]);

  return (
    <section
      className={styles.region}
      data-rowzy-surface-region="progress"
      data-person={person}
      aria-label={`${progress?.displayName ?? person} progress detail`}
      aria-hidden={active ? undefined : true}
      inert={!active}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2>
            {progress?.displayName ?? "UNAVAILABLE"}
            <span>/ PROGRESS DETAIL</span>
          </h2>
          <p data-verified={progress?.verified ?? false}>
            {progress
              ? progress.verified
                ? "◆ VERIFIED"
                : "◆ NOT CONNECTED"
              : "NOT A MEMBER OF THIS DASHBOARD"}
          </p>
        </div>
        <button
          ref={backRef}
          className={styles.back}
          type="button"
          onClick={close}
        >
          {BACK_TO_DASHBOARD_LABEL}
        </button>
      </header>

      {!progress ? (
        <div className={styles.unavailable} role="status">
          <p>
            This dashboard has no membership record for that person, so there is
            nothing to show.
          </p>
        </div>
      ) : (
        <div className={styles.body}>
          <ul className={styles.headlineRow} aria-label="Current readings">
            {progress.headline.map((metric) => (
              <li key={metric.id}>
                <HeadlineTile metric={metric} />
              </li>
            ))}
          </ul>

          <div className={styles.panes}>
            <div className={styles.mainPane}>
              <section className={styles.block} aria-label="Private progress">
                <h3 className={styles.blockTitle}>
                  PRIVATE PROGRESS
                  <span>YOUR PHOTOS · PRIVATE TO YOU</span>
                </h3>

                <ul className={styles.thumbs} aria-label="Photo timeline">
                  {photos.map((item, index) => (
                    <li key={item.id}>
                      <button
                        className={styles.thumb}
                        type="button"
                        aria-pressed={index === photoIndex}
                        onClick={() => setPhotoIndex(index)}
                      >
                        <span className={styles.thumbImage}>
                          {item.src && !item.hidden ? (
                            <Image
                              src={item.src}
                              alt={`${progress.displayName} ${item.label.toLowerCase()}`}
                              width={item.width}
                              height={item.height}
                              sizes="72px"
                            />
                          ) : (
                            <i aria-hidden="true">◱</i>
                          )}
                        </span>
                        <span>{formatShortDate(item.capturedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className={styles.comparison}>
                  <ComparisonFrame
                    title="EARLIER"
                    item={progress.comparison.earlier}
                  />
                  <ComparisonFrame
                    title="LATEST"
                    item={progress.comparison.latest ?? selectedPhoto ?? null}
                  />
                </div>

                {!progress.comparison.earlier ? (
                  <p className={styles.note}>
                    A comparison needs two dated captures. Only one is
                    available, so it is shown on its own rather than compared
                    with itself.
                  </p>
                ) : null}
                {progress.photos.unavailable ? (
                  <p className={styles.photoNotice}>
                    {progress.photos.unavailable}
                  </p>
                ) : null}
              </section>

              <section className={styles.block} aria-label="Signal timeline">
                <h3 className={styles.blockTitle}>
                  SIGNAL TIMELINE
                  <span>SYNCHRONIZED TRACKS · ONE SCALE PER UNIT</span>
                </h3>
                <div className={styles.tracks}>
                  {progress.timeline.map((series) => (
                    <SeriesTrack
                      key={series.id}
                      series={series}
                      domain={domain}
                    />
                  ))}
                </div>
                {domain ? (
                  <p className={styles.axis}>
                    <span>
                      {formatDate(new Date(domain.start).toISOString().slice(0, 10))}
                    </span>
                    <span>
                      {formatDate(new Date(domain.end).toISOString().slice(0, 10))}
                    </span>
                  </p>
                ) : null}
                <p className={styles.note}>
                  Each track keeps its own scale and unit. They share only the
                  date axis, so nothing is plotted on a scale it does not belong
                  to.
                </p>
              </section>

              <section className={styles.block} aria-label="Social platforms">
                <h3 className={styles.blockTitle}>SOCIAL</h3>
                <ul className={styles.socialList}>
                  {progress.social.map((platform) => (
                    <li
                      key={platform.platform}
                      className={styles.socialCard}
                      data-connected={platform.connected}
                    >
                      <p className={styles.socialName}>{platform.label}</p>
                      <p className={styles.socialValue}>
                        {platform.headlineValue === null
                          ? "N/A"
                          : COUNT_FORMAT.format(platform.headlineValue)}
                      </p>
                      <p className={styles.socialLabel}>
                        {platform.headlineLabel}
                        {platform.precision === "rounded" ? " · ROUNDED" : ""}
                      </p>
                      <p className={styles.socialChange}>
                        {formatSigned(platform.changeValue)}{" "}
                        {platform.changeLabel}
                      </p>
                      <p className={styles.socialStatus}>
                        {platform.status} ·{" "}
                        {platform.sourceDataAsOf
                          ? formatShortDate(platform.sourceDataAsOf)
                          : "NO SYNC"}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className={styles.note}>
                  Social accounts belong to the shared channel rather than to
                  one person, so these figures are the same on both views.
                </p>
              </section>
            </div>

            <aside className={styles.rail} aria-label="Known variables">
              <h3 className={styles.railTitle}>KNOWN VARIABLES</h3>
              {knownGroups.map(([group, variables]) => (
                <div key={group} className={styles.railGroup}>
                  <p className={styles.railGroupTitle}>{group}</p>
                  <dl className={styles.railList}>
                    {variables.map((variable) => (
                      <div key={variable.label}>
                        <dt>{variable.label}</dt>
                        <dd data-measured={variable.measured}>
                          {variable.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              <p className={styles.railFooter}>
                N/A means nothing connected to ROWZY measures it. No value is
                estimated or filled in.
              </p>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}
