"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  DoubleClapDetector,
  levelsFromByteTimeDomain,
} from "@/lib/clap-detector-core";

import styles from "./clap-mode.module.css";

/**
 * Clap mode: a header button that turns the whole screen off (pure black,
 * like a monitor in standby) and waits for a double clap. On the double clap
 * the system "boots" with a short cinematic sequence and stays on.
 *
 * Boundaries, on purpose:
 * - The microphone is opened only while the screen is black and released the
 *   instant the boot starts, on exit (Escape, tap, leaving fullscreen, hiding
 *   the tab) and on unmount. It is never opened on page load.
 * - The only thing computed from the audio is a peak and an RMS level per
 *   frame (see clap-detector-core). No recording, no speech, no network.
 * - There is always a way out that needs no microphone and no keyboard: the
 *   exit control on the black screen (tap/click), Escape, or leaving
 *   fullscreen. A denied or missing microphone can never trap the screen.
 * - The overlay is portaled to <body> so no header stacking context or
 *   backdrop-filter can confine it; focus moves into it and back out.
 * - Reduced motion: the boot cuts straight to the dashboard.
 */

type ClapPhase = "off" | "listening" | "denied" | "unavailable" | "booting";

const BOOT_MS = 2_400;
/** The global reduced-motion rule zeroes animations, so the cut is instant. */
const BOOT_REDUCED_MS = 60;
const HINT_MS = 4_000;
const FFT_SIZE = 2_048;

/** Custom event that stands in for a double clap in demos and tests. */
export const CLAP_MODE_TRIGGER_EVENT = "rowzy:clap-mode:trigger";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface Listener {
  stream: MediaStream;
  context: AudioContext;
  frame: number;
}

export function ClapMode({
  variant = "deck",
}: {
  variant?: "header" | "deck";
} = {}) {
  const [phase, setPhase] = useState<ClapPhase>("off");
  const [hintVisible, setHintVisible] = useState(true);
  const reducedMotion = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const bootTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const fullscreenRequestedRef = useRef(false);
  /** Bumped whenever a session starts or ends, so a permission prompt that
   *  resolves after exit/boot/unmount can never revive a dead session and
   *  leave a stray microphone stream open. */
  const sessionRef = useRef(0);

  const releaseMicrophone = useCallback(() => {
    const listener = listenerRef.current;
    listenerRef.current = null;
    if (!listener) return;
    cancelAnimationFrame(listener.frame);
    for (const track of listener.stream.getTracks()) track.stop();
    void listener.context.close().catch(() => undefined);
  }, []);

  const clearTimers = useCallback(() => {
    if (bootTimerRef.current !== null) {
      window.clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }, []);

  const exit = useCallback(() => {
    sessionRef.current += 1;
    releaseMicrophone();
    clearTimers();
    setPhase("off");
    if (fullscreenRequestedRef.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    fullscreenRequestedRef.current = false;
    restoreFocus();
  }, [clearTimers, releaseMicrophone, restoreFocus]);

  const boot = useCallback(() => {
    sessionRef.current += 1;
    releaseMicrophone();
    clearTimers();
    setPhase("booting");
    // When the sequence ends the overlay unmounts for good (until the button
    // is pressed again): the system is on. Fullscreen is kept — that is the
    // point of the reel shot.
    bootTimerRef.current = window.setTimeout(
      () => {
        bootTimerRef.current = null;
        setPhase("off");
        restoreFocus();
      },
      reducedMotion ? BOOT_REDUCED_MS : BOOT_MS,
    );
  }, [clearTimers, reducedMotion, releaseMicrophone, restoreFocus]);

  const showHint = useCallback(() => {
    setHintVisible(true);
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      setHintVisible(false);
      hintTimerRef.current = null;
    }, HINT_MS);
  }, []);

  const startListening = useCallback(async () => {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    releaseMicrophone();
    clearTimers();
    setPhase("listening");
    showHint();
    if (!fullscreenRequestedRef.current && document.documentElement.requestFullscreen) {
      // A user gesture started this, so fullscreen is allowed; if the
      // browser refuses, the black overlay still covers the viewport.
      fullscreenRequestedRef.current = true;
      void document.documentElement.requestFullscreen().catch(() => {
        fullscreenRequestedRef.current = false;
      });
    }
    if (!navigator.mediaDevices?.getUserMedia || !("AudioContext" in window)) {
      setPhase("unavailable");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch {
      // A late rejection must not override a boot or an exit that already
      // happened while the prompt was open.
      if (sessionRef.current === session) setPhase("denied");
      return;
    }
    // Exit, boot, unmount or another click may have ended this session while
    // the permission prompt was open: never keep a stream nobody is watching.
    if (sessionRef.current !== session) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const context = new AudioContext();
    if (context.state !== "running") {
      // Safari can start a context suspended when it is created outside the
      // click task; resume it, and give up honestly if it will not run.
      await context.resume().catch(() => undefined);
    }
    if (sessionRef.current !== session) {
      for (const track of stream.getTracks()) track.stop();
      void context.close().catch(() => undefined);
      return;
    }
    if (context.state !== "running") {
      for (const track of stream.getTracks()) track.stop();
      void context.close().catch(() => undefined);
      setPhase("denied");
      return;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    const detector = new DoubleClapDetector();
    const listener: Listener = { stream, context, frame: 0 };
    listenerRef.current = listener;

    // If the browser ends the track (device unplugged, permission revoked)
    // the screen must not stay black and deaf.
    for (const track of stream.getAudioTracks()) {
      track.onended = () => {
        if (sessionRef.current === session && listenerRef.current === listener) {
          releaseMicrophone();
          setPhase("denied");
        }
      };
    }

    const tick = () => {
      if (listenerRef.current !== listener) return;
      analyser.getByteTimeDomainData(buffer);
      const levels = levelsFromByteTimeDomain(buffer);
      const event = detector.push(levels.peak, performance.now(), levels.rms);
      if (event === "double") {
        boot();
        return;
      }
      listener.frame = requestAnimationFrame(tick);
    };
    listener.frame = requestAnimationFrame(tick);
  }, [boot, clearTimers, releaseMicrophone, showHint]);

  const overlayActive = phase !== "off";
  const waiting = phase === "listening" || phase === "denied" || phase === "unavailable";

  // While the screen is on: Escape exits, Tab stays inside, leaving
  // fullscreen or hiding the tab exits (mic must never stay open unseen),
  // and a demo/test event stands in for the double clap.
  useEffect(() => {
    if (!overlayActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
      } else if (event.key === "Tab") {
        event.preventDefault();
        screenRef.current?.focus();
      }
    };
    const onFullscreenChange = () => {
      if (fullscreenRequestedRef.current && !document.fullscreenElement && waiting) {
        fullscreenRequestedRef.current = false;
        exit();
      }
    };
    const onVisibility = () => {
      if (document.hidden && waiting) exit();
    };
    const onTrigger = () => {
      if (waiting) boot();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(CLAP_MODE_TRIGGER_EVENT, onTrigger);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(CLAP_MODE_TRIGGER_EVENT, onTrigger);
    };
  }, [boot, exit, overlayActive, waiting]);

  // Move focus into the black screen so assistive tech announces it and
  // keyboard focus cannot land on controls hidden underneath.
  useEffect(() => {
    if (overlayActive) screenRef.current?.focus({ preventScroll: true });
  }, [overlayActive]);

  // Never leave the microphone open on unmount, and make sure a permission
  // prompt that resolves afterwards is dropped too.
  useEffect(
    () => () => {
      sessionRef.current += 1;
      releaseMicrophone();
      clearTimers();
    },
    [clearTimers, releaseMicrophone],
  );

  const status =
    phase === "booting"
      ? "ROWZY is starting up."
      : phase === "denied"
        ? "Microphone blocked. Tap the screen to try again, or use the exit control or Escape."
        : phase === "unavailable"
          ? "Microphone unavailable on this connection. Use the exit control or Escape."
          : "Screen off. Listening for a double clap. Use the exit control or Escape to leave.";

  const hintText =
    phase === "denied"
      ? "microphone blocked · tap to retry"
      : phase === "unavailable"
        ? "microphone unavailable on this connection"
        : "double clap to wake";

  const overlay = overlayActive ? (
    <div
      ref={screenRef}
      className={styles.screen}
      data-phase={phase}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="Clap mode"
      tabIndex={-1}
      onClick={
        phase === "booting"
          ? undefined
          : phase === "denied"
            ? () => void startListening()
            : showHint
      }
      data-clap-mode-screen
    >
      <span className={styles.srOnly} role="status" aria-live="polite">
        {status}
      </span>
      {phase === "booting" ? (
        <div className={styles.boot} aria-hidden="true">
          <i className={styles.scanline} />
          <i className={styles.bloom} />
          <div className={styles.grid} />
          <div className={styles.tears}>
            <i /><i /><i /><i /><i />
          </div>
          <div className={styles.readout}>
            <span className={styles.readoutTag}>ROWZY // INTELLIGENCE CORE</span>
            <strong className={styles.readoutTitle}>SYSTEM ONLINE</strong>
            <span className={styles.readoutLine}>
              <b>SIGNAL</b> ACQUIRED · <b>CORE</b> SYNCED · <b>SUBJECTS</b> 02
            </span>
          </div>
          <i className={styles.iris} />
        </div>
      ) : (
        <div
          className={styles.hint}
          data-visible={hintVisible || phase !== "listening" ? "true" : "false"}
          data-state={phase}
        >
          <span>{hintText}</span>
          <button
            type="button"
            className={styles.exit}
            onClick={(event) => {
              event.stopPropagation();
              exit();
            }}
            data-clap-mode-exit
          >
            exit · esc
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => {
          if (phase === "booting") return;
          void startListening();
        }}
        aria-label="Clap mode: turn the screen off and wake it with a double clap"
        title="Clap mode — screen off, double clap to wake (JARVIS hands-free may also react to the clap)"
        data-clap-mode-trigger
        data-variant={variant}
      >
        <span className={styles.triggerDot} aria-hidden="true" />
        Clap mode
      </button>
      {overlay && typeof document !== "undefined"
        ? createPortal(overlay, document.body)
        : null}
    </>
  );
}
