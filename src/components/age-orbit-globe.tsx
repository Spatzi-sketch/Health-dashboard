"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateAgeCycleProgress,
  formatAgeTargetDate,
  type AgeCycleProgress,
} from "@/features/dashboard/age-progress";
import styles from "./age-orbit-globe.module.css";

type Person = "luke" | "rowan";

interface AgeOrbitGlobeProps {
  person: Person;
  displayName: string;
  referenceTimeIso: string;
}

interface GlobeTheme {
  rgb: readonly [number, number, number];
  secondaryRgb: readonly [number, number, number];
  phase: number;
  direction: 1 | -1;
  pitch: number;
  roll: number;
  seed: number;
  node: string;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface LandPoint extends GeoPoint {
  alpha: number;
  size: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}

interface LandZone {
  latitude: number;
  longitude: number;
  latitudeRadius: number;
  longitudeRadius: number;
  rotation: number;
}

const DEGREE = Math.PI / 180;
const FRAME_INTERVAL = 1000 / 30;

const THEMES: Record<Person, GlobeTheme> = {
  luke: {
    rgb: [110, 241, 189],
    secondaryRgb: [215, 251, 239],
    phase: 1.36,
    direction: 1,
    pitch: -0.12,
    roll: -0.055,
    seed: 11,
    node: "L-20 / ORBITAL CHRONOMETER",
  },
  rowan: {
    rgb: [112, 226, 210],
    secondaryRgb: [198, 246, 239],
    phase: -0.34,
    direction: -1,
    pitch: 0.09,
    roll: 0.06,
    seed: 29,
    node: "R-20 / ORBITAL CHRONOMETER",
  },
};

const LAND_ZONES: readonly LandZone[] = [
  { latitude: 48, longitude: -112, latitudeRadius: 25, longitudeRadius: 43, rotation: -0.16 },
  { latitude: 60, longitude: -150, latitudeRadius: 14, longitudeRadius: 24, rotation: -0.28 },
  { latitude: 18, longitude: -92, latitudeRadius: 12, longitudeRadius: 18, rotation: 0.28 },
  { latitude: -17, longitude: -61, latitudeRadius: 31, longitudeRadius: 20, rotation: -0.2 },
  { latitude: -43, longitude: -70, latitudeRadius: 18, longitudeRadius: 9, rotation: -0.14 },
  { latitude: 51, longitude: 12, latitudeRadius: 16, longitudeRadius: 24, rotation: 0.08 },
  { latitude: 8, longitude: 20, latitudeRadius: 34, longitudeRadius: 25, rotation: 0.09 },
  { latitude: -24, longitude: 27, latitudeRadius: 22, longitudeRadius: 16, rotation: 0.06 },
  { latitude: 50, longitude: 67, latitudeRadius: 27, longitudeRadius: 55, rotation: -0.08 },
  { latitude: 25, longitude: 90, latitudeRadius: 22, longitudeRadius: 38, rotation: 0.18 },
  { latitude: 6, longitude: 112, latitudeRadius: 17, longitudeRadius: 29, rotation: -0.22 },
  { latitude: -25, longitude: 134, latitudeRadius: 17, longitudeRadius: 23, rotation: 0.08 },
  { latitude: 73, longitude: -41, latitudeRadius: 12, longitudeRadius: 18, rotation: -0.22 },
  { latitude: -78, longitude: 12, latitudeRadius: 9, longitudeRadius: 175, rotation: 0 },
];

const COASTLINES: readonly (readonly GeoPoint[])[] = [
  [
    { longitude: -166, latitude: 66 }, { longitude: -146, latitude: 58 },
    { longitude: -131, latitude: 52 }, { longitude: -124, latitude: 39 },
    { longitude: -112, latitude: 27 }, { longitude: -97, latitude: 19 },
    { longitude: -82, latitude: 25 }, { longitude: -66, latitude: 44 },
    { longitude: -55, latitude: 52 }, { longitude: -78, latitude: 67 },
    { longitude: -118, latitude: 72 }, { longitude: -150, latitude: 72 },
    { longitude: -166, latitude: 66 },
  ],
  [
    { longitude: -81, latitude: 12 }, { longitude: -68, latitude: 8 },
    { longitude: -50, latitude: 2 }, { longitude: -38, latitude: -13 },
    { longitude: -47, latitude: -29 }, { longitude: -55, latitude: -55 },
    { longitude: -70, latitude: -54 }, { longitude: -78, latitude: -31 },
    { longitude: -81, latitude: 0 }, { longitude: -81, latitude: 12 },
  ],
  [
    { longitude: -10, latitude: 36 }, { longitude: 3, latitude: 51 },
    { longitude: 24, latitude: 58 }, { longitude: 45, latitude: 53 },
    { longitude: 67, latitude: 61 }, { longitude: 104, latitude: 67 },
    { longitude: 143, latitude: 54 }, { longitude: 158, latitude: 47 },
    { longitude: 142, latitude: 35 }, { longitude: 123, latitude: 24 },
    { longitude: 104, latitude: 7 }, { longitude: 82, latitude: 8 },
    { longitude: 68, latitude: 24 }, { longitude: 48, latitude: 30 },
    { longitude: 33, latitude: 31 }, { longitude: 25, latitude: 20 },
    { longitude: 14, latitude: 5 }, { longitude: 18, latitude: -35 },
    { longitude: 33, latitude: -34 }, { longitude: 51, latitude: -15 },
    { longitude: 44, latitude: 12 }, { longitude: 31, latitude: 31 },
    { longitude: 10, latitude: 37 }, { longitude: -10, latitude: 36 },
  ],
  [
    { longitude: 112, latitude: -11 }, { longitude: 145, latitude: -13 },
    { longitude: 154, latitude: -28 }, { longitude: 139, latitude: -39 },
    { longitude: 116, latitude: -35 }, { longitude: 112, latitude: -11 },
  ],
  [
    { longitude: -53, latitude: 82 }, { longitude: -20, latitude: 76 },
    { longitude: -28, latitude: 60 }, { longitude: -47, latitude: 58 },
    { longitude: -64, latitude: 70 }, { longitude: -53, latitude: 82 },
  ],
];

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash(first: number, second: number, seed: number): number {
  return fract(Math.sin(first * 12.9898 + second * 78.233 + seed * 37.719) * 43758.5453);
}

function wrappedLongitudeDelta(longitude: number, center: number): number {
  return ((longitude - center + 540) % 360) - 180;
}

function isLand(latitude: number, longitude: number): boolean {
  for (let index = 0; index < LAND_ZONES.length; index += 1) {
    const zone = LAND_ZONES[index];
    const deltaLongitude = wrappedLongitudeDelta(longitude, zone.longitude);
    const deltaLatitude = latitude - zone.latitude;
    const cosine = Math.cos(zone.rotation);
    const sine = Math.sin(zone.rotation);
    const x = deltaLongitude * cosine - deltaLatitude * sine;
    const y = deltaLongitude * sine + deltaLatitude * cosine;
    const distance =
      (x * x) / (zone.longitudeRadius * zone.longitudeRadius) +
      (y * y) / (zone.latitudeRadius * zone.latitudeRadius);
    const edgeNoise =
      0.9 +
      hash(latitude * 0.7, longitude * 0.7, index + 5) * 0.19 +
      Math.sin((latitude + longitude) * 0.19) * 0.035;
    if (distance < edgeNoise) return true;
  }
  return false;
}

function buildLandPoints(): LandPoint[] {
  const points: LandPoint[] = [];
  for (let latitude = -84; latitude <= 84; latitude += 2.8) {
    for (let longitude = -180; longitude < 180; longitude += 2.8) {
      if (!isLand(latitude, longitude)) continue;
      const density = hash(latitude, longitude, 17);
      if (density < 0.28) continue;
      points.push({
        latitude: latitude + (hash(latitude, longitude, 31) - 0.5) * 1.7,
        longitude: longitude + (hash(longitude, latitude, 47) - 0.5) * 1.7,
        alpha: 0.25 + density * 0.6,
        size: 0.38 + hash(latitude, longitude, 59) * 0.82,
      });
    }
  }
  return points;
}

function subdivideCoastlines(): GeoPoint[][] {
  return COASTLINES.map((outline) => {
    const output: GeoPoint[] = [];
    for (let index = 0; index < outline.length - 1; index += 1) {
      const start = outline[index];
      const end = outline[index + 1];
      const longitudeDistance = wrappedLongitudeDelta(end.longitude, start.longitude);
      const latitudeDistance = end.latitude - start.latitude;
      const steps = Math.max(2, Math.ceil(Math.hypot(longitudeDistance, latitudeDistance) / 2.5));
      for (let step = 0; step < steps; step += 1) {
        const ratio = step / steps;
        output.push({
          longitude: start.longitude + longitudeDistance * ratio,
          latitude: start.latitude + latitudeDistance * ratio,
        });
      }
    }
    output.push(outline.at(-1) ?? outline[0]);
    return output;
  });
}

const LAND_POINTS = buildLandPoints();
const DETAILED_COASTLINES = subdivideCoastlines();

function buildLatitudeGraticules(): GeoPoint[][] {
  const graticules: GeoPoint[][] = [];
  for (let latitude = -72; latitude <= 72; latitude += 12) {
    const points: GeoPoint[] = [];
    for (let longitude = -180; longitude <= 180; longitude += 4) {
      points.push({ latitude, longitude });
    }
    graticules.push(points);
  }
  return graticules;
}

function buildLongitudeGraticules(): GeoPoint[][] {
  const graticules: GeoPoint[][] = [];
  for (let longitude = -180; longitude < 180; longitude += 15) {
    const points: GeoPoint[] = [];
    for (let latitude = -90; latitude <= 90; latitude += 3) {
      points.push({ latitude, longitude });
    }
    graticules.push(points);
  }
  return graticules;
}

const LATITUDE_GRATICULES = buildLatitudeGraticules();
const LONGITUDE_GRATICULES = buildLongitudeGraticules();

function rgba(rgb: readonly [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function projectPointInto(
  point: GeoPoint,
  yaw: number,
  theme: GlobeTheme,
  centerX: number,
  centerY: number,
  radius: number,
  projected: ProjectedPoint,
  xOffset = 0,
): void {
  const latitude = point.latitude * DEGREE;
  const longitude = point.longitude * DEGREE + yaw;
  const cosineLatitude = Math.cos(latitude);
  const x = cosineLatitude * Math.sin(longitude);
  const y = Math.sin(latitude);
  const z = cosineLatitude * Math.cos(longitude);
  const pitchedY = y * Math.cos(theme.pitch) - z * Math.sin(theme.pitch);
  const pitchedZ = y * Math.sin(theme.pitch) + z * Math.cos(theme.pitch);
  const rolledX = x * Math.cos(theme.roll) - pitchedY * Math.sin(theme.roll);
  const rolledY = x * Math.sin(theme.roll) + pitchedY * Math.cos(theme.roll);
  const perspective = 1 + Math.max(-0.7, pitchedZ) * 0.045;
  projected.x = centerX + xOffset + rolledX * radius * perspective;
  projected.y = centerY + rolledY * radius * perspective;
  projected.depth = pitchedZ;
  projected.visible = pitchedZ > -0.035;
}

function drawProjectedLine(
  context: CanvasRenderingContext2D,
  points: readonly GeoPoint[],
  yaw: number,
  theme: GlobeTheme,
  centerX: number,
  centerY: number,
  radius: number,
  xOffset = 0,
): void {
  let drawing = false;
  const projected: ProjectedPoint = {
    x: 0,
    y: 0,
    depth: 0,
    visible: false,
  };
  context.beginPath();
  for (const point of points) {
    projectPointInto(
      point,
      yaw,
      theme,
      centerX,
      centerY,
      radius,
      projected,
      xOffset,
    );
    if (!projected.visible) {
      drawing = false;
      continue;
    }
    if (drawing) context.lineTo(projected.x, projected.y);
    else context.moveTo(projected.x, projected.y);
    drawing = true;
  }
  context.stroke();
}

function drawSignalField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  theme: GlobeTheme,
): void {
  const centerY = height * 0.5;
  for (let band = -9; band <= 9; band += 1) {
    const alpha = 0.022 + (1 - Math.abs(band) / 10) * 0.032;
    context.strokeStyle = rgba(theme.rgb, alpha);
    context.lineWidth = 0.5;
    context.beginPath();
    for (let x = -8; x <= width + 8; x += 8) {
      const distance = (x - width * 0.5) / Math.max(width, 1);
      const amplitude = 3 + Math.cos(distance * Math.PI) * 5;
      const y =
        centerY +
        band * 7.5 +
        Math.sin(x * 0.018 + band * 0.39 + time * 0.00014 * theme.direction) * amplitude;
      if (x === -8) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawSphere(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  progress: number,
  theme: GlobeTheme,
  xOffset = 0,
  opacity = 1,
): void {
  const centerX = width * 0.5;
  const centerY = height * 0.47;
  const radius = Math.max(18, Math.min(width * 0.245, height * 0.325));
  const yaw = theme.phase + time * 0.000035 * theme.direction;

  context.save();
  context.globalAlpha = opacity;

  const aura = context.createRadialGradient(
    centerX + xOffset,
    centerY,
    radius * 0.22,
    centerX + xOffset,
    centerY,
    radius * 1.45,
  );
  aura.addColorStop(0, rgba(theme.rgb, 0.075));
  aura.addColorStop(0.64, rgba(theme.rgb, 0.025));
  aura.addColorStop(1, rgba(theme.rgb, 0));
  context.fillStyle = aura;
  context.beginPath();
  context.arc(centerX + xOffset, centerY, radius * 1.45, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(centerX + xOffset, centerY, radius, 0, Math.PI * 2);
  context.clip();

  context.strokeStyle = rgba(theme.rgb, 0.11);
  context.lineWidth = 0.46;
  for (const points of LATITUDE_GRATICULES) {
    drawProjectedLine(context, points, yaw, theme, centerX, centerY, radius, xOffset);
  }

  context.strokeStyle = rgba(theme.secondaryRgb, 0.085);
  context.lineWidth = 0.42;
  for (const points of LONGITUDE_GRATICULES) {
    drawProjectedLine(context, points, yaw, theme, centerX, centerY, radius, xOffset);
  }

  const projectedLandPoint: ProjectedPoint = {
    x: 0,
    y: 0,
    depth: 0,
    visible: false,
  };
  for (const point of LAND_POINTS) {
    projectPointInto(
      point,
      yaw,
      theme,
      centerX,
      centerY,
      radius,
      projectedLandPoint,
      xOffset,
    );
    if (!projectedLandPoint.visible) continue;
    const depthAlpha = Math.min(
      1,
      Math.max(0.12, (projectedLandPoint.depth + 0.08) * 1.18),
    );
    context.fillStyle = rgba(theme.secondaryRgb, point.alpha * depthAlpha * 0.74);
    context.fillRect(
      projectedLandPoint.x,
      projectedLandPoint.y,
      point.size * (0.7 + depthAlpha * 0.45),
      point.size * (0.7 + depthAlpha * 0.45),
    );
  }

  context.strokeStyle = rgba(theme.secondaryRgb, 0.34);
  context.lineWidth = 0.7;
  context.shadowColor = rgba(theme.rgb, 0.24);
  context.shadowBlur = 3;
  for (const coastline of DETAILED_COASTLINES) {
    drawProjectedLine(
      context,
      coastline,
      yaw,
      theme,
      centerX,
      centerY,
      radius,
      xOffset,
    );
  }
  context.shadowBlur = 0;

  const terminator = Math.max(0.025, Math.min(0.975, progress));
  const shade = context.createLinearGradient(
    centerX + xOffset - radius,
    centerY,
    centerX + xOffset + radius,
    centerY,
  );
  shade.addColorStop(0, rgba(theme.rgb, 0.055));
  shade.addColorStop(Math.max(0, terminator - 0.035), rgba(theme.rgb, 0.025));
  shade.addColorStop(terminator, "rgba(0, 3, 4, 0.18)");
  shade.addColorStop(Math.min(1, terminator + 0.055), "rgba(0, 3, 4, 0.54)");
  shade.addColorStop(1, "rgba(0, 2, 3, 0.72)");
  context.fillStyle = shade;
  context.fillRect(centerX + xOffset - radius, centerY - radius, radius * 2, radius * 2);
  context.restore();

  context.strokeStyle = rgba(theme.secondaryRgb, 0.2);
  context.lineWidth = 0.7;
  context.beginPath();
  context.arc(centerX + xOffset, centerY, radius, 0, Math.PI * 2);
  context.stroke();

  context.setLineDash([2.5, 4.5]);
  context.strokeStyle = rgba(theme.rgb, 0.14);
  context.beginPath();
  context.arc(centerX + xOffset, centerY, radius * 1.085, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = rgba(theme.secondaryRgb, 0.82);
  context.lineWidth = 1.35;
  context.shadowColor = rgba(theme.rgb, 0.72);
  context.shadowBlur = 5;
  context.beginPath();
  context.arc(
    centerX + xOffset,
    centerY,
    radius * 1.085,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * progress,
  );
  context.stroke();
  context.shadowBlur = 0;

  for (let tick = 0; tick < 72; tick += 1) {
    const angle = (tick / 72) * Math.PI * 2 - Math.PI / 2;
    const active = tick / 72 <= progress;
    const inner = radius * (tick % 6 === 0 ? 1.13 : 1.145);
    const outer = radius * 1.17;
    context.strokeStyle = active
      ? rgba(theme.secondaryRgb, 0.48)
      : rgba(theme.secondaryRgb, 0.1);
    context.lineWidth = tick % 6 === 0 ? 0.8 : 0.45;
    context.beginPath();
    context.moveTo(
      centerX + xOffset + Math.cos(angle) * inner,
      centerY + Math.sin(angle) * inner,
    );
    context.lineTo(
      centerX + xOffset + Math.cos(angle) * outer,
      centerY + Math.sin(angle) * outer,
    );
    context.stroke();
  }

  context.save();
  context.translate(centerX + xOffset, centerY);
  context.rotate(theme.roll * 0.7);
  for (let particle = 0; particle < 42; particle += 1) {
    const angle =
      (particle / 42) * Math.PI * 2 +
      time * 0.00008 * theme.direction +
      theme.seed;
    const pulse = 0.45 + 0.55 * Math.sin(time * 0.0018 + particle * 1.7);
    const x = Math.cos(angle) * radius * 1.32;
    const y = Math.sin(angle) * radius * 0.38;
    context.fillStyle = rgba(theme.rgb, 0.08 + pulse * 0.26);
    const size = particle % 7 === 0 ? 1.3 : 0.65;
    context.fillRect(x, y, size, size);
  }
  context.restore();

  context.restore();
}

function renderGlobe(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  progress: number,
  theme: GlobeTheme,
  reducedMotion: boolean,
): void {
  context.clearRect(0, 0, width, height);
  drawSignalField(context, width, height, reducedMotion ? 0 : time, theme);
  drawSphere(context, width, height, reducedMotion ? 0 : time, progress, theme);

  if (reducedMotion) return;
  const glitchCycle = (time * 0.001 + theme.seed * 0.73) % 8.6;
  const glitchStrength = glitchCycle > 8.18 ? (glitchCycle - 8.18) / 0.42 : 0;
  if (glitchStrength <= 0) return;

  const centerY = height * 0.47;
  for (let slice = 0; slice < 4; slice += 1) {
    const sliceHeight = 2 + ((slice * 7 + theme.seed) % 8);
    const y = centerY - height * 0.23 + ((slice * 37 + theme.seed * 11) % Math.max(1, height * 0.46));
    const offset =
      (slice % 2 === 0 ? 1 : -1) *
      (2.5 + slice * 1.7) *
      glitchStrength *
      theme.direction;
    context.save();
    context.beginPath();
    context.rect(0, y, width, sliceHeight);
    context.clip();
    drawSphere(context, width, height, time + slice * 43, progress, theme, offset, 0.42);
    context.restore();
  }
}

function progressFromReference(referenceTimeIso: string): AgeCycleProgress {
  const reference = new Date(referenceTimeIso);
  return calculateAgeCycleProgress(
    Number.isFinite(reference.getTime()) ? reference : new Date(),
  );
}

export function AgeOrbitGlobe({
  person,
  displayName,
  referenceTimeIso,
}: AgeOrbitGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialProgress = useMemo(
    () => progressFromReference(referenceTimeIso),
    [referenceTimeIso],
  );
  const [progress, setProgress] = useState(initialProgress);
  const theme = THEMES[person];

  useEffect(() => {
    const refresh = () => setProgress(calculateAgeCycleProgress(new Date()));
    refresh();
    const interval = window.setInterval(refresh, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = -FRAME_INTERVAL;
    let visible = true;
    let pageVisible = document.visibilityState === "visible";
    let cinematicPaused =
      document.documentElement.dataset.rowzyCinematic === "active";
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;

    const draw = (time: number) => {
      if (width <= 0 || height <= 0) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      const pixelRatio = canvas.width / width;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderGlobe(
        context,
        width,
        height,
        time,
        progress.progress,
        theme,
        reducedMotion,
      );
    };

    const schedule = () => {
      if (
        frame ||
        reducedMotion ||
        !visible ||
        !pageVisible ||
        cinematicPaused
      ) return;
      frame = window.requestAnimationFrame(animate);
    };

    const animate = (time: number) => {
      frame = 0;
      if (time - lastFrame >= FRAME_INTERVAL) {
        lastFrame = time;
        draw(time);
      }
      schedule();
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      draw(performance.now());
      schedule();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (!visible && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    });
    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      if (!pageVisible && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      draw(performance.now());
      schedule();
    };
    const onCinematicChange = () => {
      cinematicPaused =
        document.documentElement.dataset.rowzyCinematic === "active";
      if (cinematicPaused && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      draw(performance.now());
      schedule();
    };

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionChange);
    window.addEventListener("rowzy:cinematic-change", onCinematicChange);
    resize();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("rowzy:cinematic-change", onCinematicChange);
    };
  }, [progress.progress, theme]);

  const accessibleLabel = `${displayName} is age ${progress.age}, ${progress.progressPercent.toFixed(
    1,
  )}% through the year to age ${progress.targetAge}, with ${progress.daysRemaining} days remaining.`;

  return (
    <section
      className={styles.orbitModule}
      data-person={person}
      aria-label={accessibleLabel}
    >
      <canvas className={styles.canvas} ref={canvasRef} aria-hidden="true" />
      <span className={styles.corner} data-corner="top-left" aria-hidden="true" />
      <span className={styles.corner} data-corner="top-right" aria-hidden="true" />
      <span className={styles.corner} data-corner="bottom-left" aria-hidden="true" />
      <span className={styles.corner} data-corner="bottom-right" aria-hidden="true" />
      <span className={styles.glitchBand} aria-hidden="true" />

      <header className={styles.moduleHeader}>
        <div>
          <p>{theme.node}</p>
          <span className={styles.birthLine}>BORN 15 JAN 2000 · EARTH / SOL-3</span>
        </div>
        <span className={styles.lockState}>CALENDAR LOCK</span>
      </header>

      <div className={styles.ageBlock}>
        <span>AGE</span>
        <strong>{progress.age}</strong>
        <small>EARTH YEARS</small>
      </div>

      <div className={styles.targetBlock}>
        <span>TARGET</span>
        <strong>{progress.targetAge}</strong>
        <small>{formatAgeTargetDate(progress.targetDate)}</small>
      </div>

      <dl className={styles.cycleLegend}>
        <div>
          <dt>ORBIT COMPLETE</dt>
          <dd>{progress.progressPercent.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>TIME REMAINING</dt>
          <dd>{progress.remainingPercent.toFixed(1)}%</dd>
        </div>
      </dl>

      <div className={styles.progressRail} aria-hidden="true">
        <span style={{ width: `${progress.progressPercent}%` }} />
        <i style={{ left: `${progress.progressPercent}%` }} />
      </div>

      <footer className={styles.moduleFooter}>
        <span>{progress.daysRemaining} DAYS TO {progress.targetAge}</span>
        <span>{progress.daysElapsed}/{progress.daysInCycle} DAYS ELAPSED</span>
      </footer>

      <p className={styles.compactLine}>
        <strong>AGE {progress.age}</strong>
        <span>{progress.progressPercent.toFixed(1)}% COMPLETE</span>
        <span>{progress.daysRemaining}D TO {progress.targetAge}</span>
      </p>
    </section>
  );
}
