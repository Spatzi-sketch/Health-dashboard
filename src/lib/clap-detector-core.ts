/**
 * Double-clap detection on a stream of coarse level frames.
 *
 * Pure and deterministic so it can be tested without a microphone. The
 * browser layer feeds it one frame per animation tick — the peak absolute
 * sample value in 0..1, optionally the RMS of the same window, and a
 * monotonic timestamp — and this module decides when two short, sharp
 * transients happened close together.
 *
 * What counts as a clap here — deliberately narrow, so speech, music, keys
 * and room noise do not fire it:
 *   1. an onset: the peak jumps above the adaptive noise floor by
 *      `onsetRatio` (and above `minPeak` in absolute terms) from a frame that
 *      was below the release level;
 *   2. a transient shape: when RMS is supplied, the crest factor (peak / RMS)
 *      of the onset window must reach `minCrest`. A clap is a spike in a low
 *      tail (crest ≳ 6); a syllable, bark, laugh or cough fills its window
 *      (crest ≲ 3);
 *   3. a fast decay: within `decayWindowMs` the peak drops back under the
 *      release level. Sustained loudness (talking, a song) never decays that
 *      fast, so it is discarded and the floor learns it instead;
 *   4. a second qualified onset between `minGapMs` and `maxGapMs` after the
 *      first (measured onset-to-onset). Sooner is one clap's echo, later is
 *      two unrelated sounds;
 *   5. after a double fires, `cooldownMs` of silence from the detector: the
 *      third and fourth claps of an enthusiastic burst are part of the same
 *      gesture, not the start of a new one.
 *
 * The noise floor rises deliberately slowly (and never more than a bounded
 * step per frame), so the claps' own tails cannot raise the bar between the
 * first clap and its partner; it falls faster, so the detector re-sensitises
 * quickly when a room goes quiet.
 *
 * Nothing in here records, stores or transmits audio; the input is one or
 * two loudness numbers per frame.
 */

export interface DoubleClapDetectorConfig {
  /** Absolute peak (0..1) below which nothing is ever an onset. */
  minPeak: number;
  /** Onset threshold as a multiple of the adaptive noise floor. */
  onsetRatio: number;
  /** Release threshold as a multiple of the floor; the level must fall under it. */
  releaseRatio: number;
  /**
   * While an onset is pending, the release level is at least this fraction
   * of the onset peak, so a loud clap in a quiet or reverberant room is not
   * asked to fall all the way to near-silence within the decay window.
   */
  releaseOfPeak: number;
  /** A clap must decay under the release level within this many ms. */
  decayWindowMs: number;
  /** Ignore new onsets for this long after a qualified onset (echo/reverb). */
  refractoryMs: number;
  /** Second clap must land at least this long after the first. */
  minGapMs: number;
  /** ...and no later than this. */
  maxGapMs: number;
  /** Ignore all onsets for this long after a double fires (burst = one gesture). */
  cooldownMs: number;
  /** Per-frame smoothing toward a LOUDER room (0..1); kept slow on purpose. */
  floorRiseAdapt: number;
  /** Per-frame smoothing toward a QUIETER room (0..1); faster than the rise. */
  floorFallAdapt: number;
  /** One frame may pull the floor toward at most this multiple of itself. */
  floorRiseClamp: number;
  /** Floor can never be adapted below this. */
  floorMin: number;
  /** Minimum crest factor (peak / RMS) for an onset when RMS is supplied. */
  minCrest: number;
}

export const DEFAULT_DOUBLE_CLAP_CONFIG: DoubleClapDetectorConfig = {
  // Was 0.18: admits soft/distant claps (across the room, cupped hands)
  // while keyboards and whispers stay below ~0.1.
  minPeak: 0.12,
  // Was 3.2: admits claps over moderate room noise without letting a level
  // merely "a bit above the room" through (guard keeps this ≥ 2.5).
  onsetRatio: 2.8,
  releaseRatio: 1.6,
  // Was 0.12: a reverberant room holds a tail near 1/6 of the clap peak, so
  // the clap is only asked to fall to 16% of its own peak, not 12%.
  releaseOfPeak: 0.16,
  // Was 180: live rooms ring longer; speech still cannot decay this fast.
  decayWindowMs: 240,
  refractoryMs: 110,
  // Was 140: admits quick, snappy double claps; still past the echo window.
  minGapMs: 120,
  // Was 700: casual double claps commonly land 700–900ms apart.
  maxGapMs: 900,
  // After a double, an enthusiastic triple/quadruple burst stays one gesture.
  cooldownMs: 1_000,
  // Was one symmetric 0.06: rising slowly means a clap's own reverb tail
  // cannot raise the onset bar before the partner clap arrives.
  floorRiseAdapt: 0.02,
  floorFallAdapt: 0.06,
  // A single loud transient frame cannot yank the floor up in one step.
  floorRiseClamp: 4,
  floorMin: 0.02,
  // Was 3.5: a distant clap whose spike straddles a frame boundary loses
  // crest; syllables (~2) and coughs (≲3) still fall short.
  minCrest: 3.0,
};

export type DoubleClapEvent = "idle" | "onset" | "first" | "double";

interface PendingOnset {
  atMs: number;
  peak: number;
  /** Frames seen since the onset (the onset frame itself is 0). */
  frames: number;
  /** Highest crest factor observed over the onset frame and the next one. */
  crestMax: number;
  /** Whether any RMS value was supplied for this onset. */
  crestSeen: boolean;
}

export class DoubleClapDetector {
  private readonly config: DoubleClapDetectorConfig;
  private floor: number;
  private above = false;
  private pending: PendingOnset | null = null;
  private firstClapAt: number | null = null;
  private lastQualifiedAt: number | null = null;
  private cooldownUntil = 0;

  constructor(config: Partial<DoubleClapDetectorConfig> = {}) {
    this.config = { ...DEFAULT_DOUBLE_CLAP_CONFIG, ...config };
    this.floor = this.config.floorMin;
  }

  /** Current adaptive noise floor (peak units, 0..1). */
  get noiseFloor(): number {
    return this.floor;
  }

  /** Whether one qualified clap is waiting for its partner. */
  get awaitingSecond(): boolean {
    return this.firstClapAt !== null;
  }

  reset(): void {
    this.above = false;
    this.pending = null;
    this.firstClapAt = null;
    this.lastQualifiedAt = null;
    this.cooldownUntil = 0;
  }

  /**
   * Feed one frame. `peak` is the maximum absolute sample value in the frame
   * (0..1); `nowMs` is a monotonic clock; `rms` (optional, same units) lets
   * the crest-factor test run. Returns what this frame concluded.
   */
  push(peak: number, nowMs: number, rms?: number): DoubleClapEvent {
    const level = clamp01(peak);
    const cfg = this.config;
    const onsetLevel = Math.max(cfg.minPeak, this.floor * cfg.onsetRatio);
    let event: DoubleClapEvent = "idle";

    // Expire a first clap whose partner never came. Measured against the
    // onset being resolved (if any), so decay latency never eats the gap.
    const reference = this.pending ? this.pending.atMs : nowMs;
    if (this.firstClapAt !== null && reference - this.firstClapAt > cfg.maxGapMs) {
      this.firstClapAt = null;
    }

    // Resolve a pending onset: did it keep a clap's shape and decay fast?
    if (this.pending) {
      const pending = this.pending;
      pending.frames += 1;
      if (rms !== undefined && pending.frames <= 1) {
        pending.crestSeen = true;
        pending.crestMax = Math.max(pending.crestMax, crest(level, rms));
      }
      const releaseLevel = Math.max(
        cfg.floorMin,
        this.floor * cfg.releaseRatio,
        pending.peak * cfg.releaseOfPeak,
      );
      if (level < releaseLevel) {
        this.pending = null;
        this.above = false;
        const shapeOk = !pending.crestSeen || pending.crestMax >= cfg.minCrest;
        if (shapeOk) {
          this.lastQualifiedAt = pending.atMs;
          event = this.registerClap(pending.atMs);
        }
      } else if (nowMs - pending.atMs > cfg.decayWindowMs) {
        // Sustained sound: not a clap. `above` stays latched until the level
        // falls, and the floor learns the new room level meanwhile.
        this.pending = null;
      }
    }

    const inRefractory =
      this.lastQualifiedAt !== null &&
      nowMs - this.lastQualifiedAt < cfg.refractoryMs;
    // Trailing claps of a burst right after a double: same gesture, ignore.
    const inCooldown = nowMs < this.cooldownUntil;

    if (!this.pending) {
      const releaseLevel = Math.max(cfg.floorMin, this.floor * cfg.releaseRatio);
      if (!this.above && level >= onsetLevel && !inRefractory && !inCooldown) {
        this.above = true;
        this.pending = {
          atMs: nowMs,
          peak: level,
          frames: 0,
          crestMax: rms === undefined ? 0 : crest(level, rms),
          crestSeen: rms !== undefined,
        };
        if (event === "idle") event = "onset";
      } else if (this.above && level < releaseLevel) {
        this.above = false;
      }
    }

    // Adapt the floor from every frame that is not tracking an onset — so a
    // clap does not raise the bar for its partner, but sustained sound does
    // raise the room level and release the latch. Rising is slow and bounded
    // per frame (reverb tails and cooldown-suppressed claps barely move it);
    // falling is faster so a room going quiet re-sensitises promptly.
    if (!this.pending) {
      const rising = level > this.floor;
      const target = rising
        ? Math.min(level, this.floor * cfg.floorRiseClamp)
        : level;
      const adapt = rising ? cfg.floorRiseAdapt : cfg.floorFallAdapt;
      this.floor = Math.max(
        cfg.floorMin,
        this.floor + (target - this.floor) * adapt,
      );
    }

    return event;
  }

  private registerClap(atMs: number): DoubleClapEvent {
    const cfg = this.config;
    if (this.firstClapAt === null) {
      this.firstClapAt = atMs;
      return "first";
    }
    const gap = atMs - this.firstClapAt;
    if (gap >= cfg.minGapMs && gap <= cfg.maxGapMs) {
      this.firstClapAt = null;
      // A triple/quadruple burst is one gesture: fire once, then go deaf
      // for cooldownMs so the trailing claps cannot start a new pair.
      this.cooldownUntil = atMs + cfg.cooldownMs;
      return "double";
    }
    if (gap > cfg.maxGapMs) {
      this.firstClapAt = atMs;
      return "first";
    }
    // Echo of the first clap: ignore.
    return "idle";
  }
}

export interface FrameLevels {
  peak: number;
  rms: number;
}

/**
 * Peak absolute value and RMS of a time-domain buffer of 8-bit unsigned
 * samples (the AnalyserNode byte format), both in 0..1.
 */
export function levelsFromByteTimeDomain(samples: ArrayLike<number>): FrameLevels {
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = (samples[index] - 128) / 128;
    const magnitude = Math.abs(centered);
    if (magnitude > peak) peak = magnitude;
    sumSquares += centered * centered;
  }
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
  return { peak: clamp01(peak), rms: clamp01(rms) };
}

/** Peak only; kept for callers that do not need the crest test. */
export function peakFromByteTimeDomain(samples: ArrayLike<number>): number {
  return levelsFromByteTimeDomain(samples).peak;
}

function crest(peak: number, rms: number): number {
  return peak / Math.max(rms, 1e-4);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
