"use client";

/**
 * MISSION DECK — Mission-Control-style navigation for the real dashboard.
 *
 * Ported from the operator-approved design-lab concept
 * (src/app/design-lab/mission-deck.tsx, section 17). A deliberate upward
 * over-scroll past the top of whatever the operator is scrolling — the page
 * itself or an open surface's own scroller — opens a full-screen deck of
 * titled tiles, one per room of the dashboard. Scrolling down never opens
 * the deck. Clicking a tile puts the deck away and travels there through
 * the existing surface provider, so every move keeps the pinned slide-over
 * mechanics; the deck itself never touches a document attribute and never
 * re-implements surface travel.
 *
 * Two honest differences from the lab demo:
 * - The lab shrinks its framed demo viewport into the tile with a FLIP
 *   transform. The real page cannot be wrapped and transformed without
 *   restructuring the shell, so here the live dashboard stays where it is,
 *   dimmed and blurred behind the deck's backdrop, and the tile grid carries
 *   the zoom (400ms, var(--vitals-ease)) — same grammar, real page intact.
 * - Tiles navigate for real: selecting one closes the deck, restores focus,
 *   and then asks the provider to travel, so the surface's own entrance
 *   animation plays instead of the demo's zoom-up.
 *
 * The deep upward over-scroll gesture is the only way in (2026-08-19: the
 * operator removed the DECK edge tab and then the SYSTEMS/JARVIS edge tabs
 * too — the deck's tiles are now the sole doorway to those surfaces).
 *
 * The deck also carries a slim toggle row under the tile grid (2026-08-19:
 * the operator asked for Clap mode on the Mission Deck at the bottom, out of
 * the top bar). ClapMode is the same self-contained component it always was —
 * moved, not forked — and it portals its black screen to <body>, above the
 * deck.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { DashboardSurfaceKind } from "@/lib/dashboard/surfaces";

import { ClapMode } from "./clap-mode";
import { useDashboardSurface } from "./dashboard-surfaces";
import styles from "./mission-deck-nav.module.css";

/* -- gesture core -----------------------------------------------------------
 * The over-scroll accumulator, ported from the design-lab demo. Pure and
 * self-contained on purpose: tests/mission-deck-nav.test.ts extracts this
 * block from the source and evaluates it directly (importing the component
 * would drag the CSS module into Node), so keep everything between these two
 * markers dependency-free.
 */

/**
 * Over-scroll intent threshold, in normalized wheel pixels. Deltas count only
 * while the active scroll chain is already at its top and still moving up;
 * ~760px is a long, unmistakably deliberate push past the start — the
 * operator found 320px too easy to trip with trackpad inertia — so an
 * ordinary scroll that merely reaches the top never gets close.
 */
export const OVERSCROLL_THRESHOLD = 760;

/** A pause longer than this abandons the accumulated charge. */
export const OVERSCROLL_WINDOW_MS = 650;

export interface OverscrollState {
  /** Accumulated upward push, in normalized pixels. */
  readonly sum: number;
  /** Timestamp of the last contributing delta, ms. */
  readonly at: number;
}

export const OVERSCROLL_IDLE: OverscrollState = { sum: 0, at: 0 };

/** Normalize a wheel delta to pixels (deltaMode: 0 pixels, 1 lines, 2 pages). */
export function wheelDeltaPixels(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  return deltaY * unit;
}

export interface OverscrollFeed {
  /** Normalized delta; positive is downward, negative is upward. */
  readonly delta: number;
  /** Whether every scroller in the active chain is already at its start. */
  readonly atTop: boolean;
  /** Current time, ms. */
  readonly now: number;
}

/**
 * Accumulate over-scroll intent.
 *
 * Reaching the top contributes nothing by itself: only upward deltas
 * received while already at the top count, the sum starts over after
 * OVERSCROLL_WINDOW_MS of silence, and any downward delta or departure from
 * the top resets it entirely. `open` becomes true only once the sum passes
 * OVERSCROLL_THRESHOLD — a scroll that stops at the start can never set it,
 * and a downward scroll can never open the deck at all.
 */
export function feedOverscroll(
  state: OverscrollState,
  feed: OverscrollFeed,
): { state: OverscrollState; charge: number; open: boolean } {
  if (!feed.atTop || feed.delta >= 0) {
    return { state: { sum: 0, at: feed.now }, charge: 0, open: false };
  }
  const stale = feed.now - state.at > OVERSCROLL_WINDOW_MS;
  const sum = (stale ? 0 : state.sum) + -feed.delta;
  if (sum >= OVERSCROLL_THRESHOLD) {
    return { state: { sum: 0, at: 0 }, charge: 1, open: true };
  }
  return {
    state: { sum, at: feed.now },
    charge: Math.min(1, sum / OVERSCROLL_THRESHOLD),
    open: false,
  };
}

/* -- end gesture core ------------------------------------------------------ */

/** Tolerance for "at the top", matching the lab demo's 2px slack. */
const TOP_SLACK_PX = 2;

/** Zoom clock, the lab's 400ms on var(--vitals-ease). */
const DECK_ZOOM_MS = 400;

/**
 * True when nothing under the pointer can still scroll up: every scrollable
 * ancestor of the event target is at its start, and so is the page itself.
 * This covers the two dominant cases — the dashboard page scroll and an open
 * surface's own scroll region — and, by the same rule, nested panes inside a
 * surface. A pane that is not at its top (or a page that can still move
 * back up) vetoes the charge, so scroll chaining can never masquerade as
 * intent.
 */
function scrollableChainAtTop(target: EventTarget | null): boolean {
  const atTop = (el: Element): boolean => el.scrollTop <= TOP_SLACK_PX;
  const root = document.documentElement;
  let node = target instanceof Element ? target : null;
  while (node && node !== root && node !== document.body) {
    if (node.scrollHeight - node.clientHeight > TOP_SLACK_PX * 2) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        !atTop(node)
      ) {
        return false;
      }
    }
    node = node.parentElement;
  }
  return atTop(document.scrollingElement ?? root);
}

/**
 * Scroll a dashboard-resident panel into view after the deck closes and pulse
 * the vitals rail so the eye lands. The pulse attribute is removed on a
 * timer; the CSS lives in this component's module under :global.
 */
function focusDashboardPanel(selector: string): void {
  window.setTimeout(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersInstant() ? "auto" : "smooth",
      block: "start",
    });
    const panels = document.querySelectorAll(
      '[data-rowzy-cinematic-panel^="whoop-"]',
    );
    for (const panel of panels) {
      panel.setAttribute("data-rowzy-deck-focus", "true");
    }
    window.setTimeout(() => {
      for (const panel of panels) {
        panel.removeAttribute("data-rowzy-deck-focus");
      }
    }, 1600);
  }, 60);
}

/** Reduced motion means instant swaps — no zoom phases at all. */
function prefersInstant(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The assistant's answer card: modal, and above the deck. */
function modalCardIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/* -- destinations ------------------------------------------------------------ */

type DeckTileId =
  | "dashboard"
  | "whoop"
  | "systems"
  | "jarvis"
  | "analytics"
  | "broll"
  | "design-lab";

interface DeckTile {
  readonly id: DeckTileId;
  readonly title: string;
  /** The surface the provider travels to; null is the dashboard resting state. */
  readonly kind: Exclude<DashboardSurfaceKind, "dashboard" | "progress"> | null;
  /** Development-only route tile (the Design Lab); navigates the browser. */
  readonly href?: string;
  /**
   * A dashboard-resident destination: closing the deck scrolls this selector
   * into view and pulses it, removing nothing from the dashboard itself
   * (2026-08-19: the operator asked for a WHOOP tile without moving WHOOP
   * off the dashboard).
   */
  readonly focus?: string;
}

/**
 * The rooms of the dashboard, one tile each. The person-scoped detail surface
 * is deliberately absent: it is contextual (opened from a person's frame),
 * not a room of the house.
 */
const DECK_TILES: readonly DeckTile[] = [
  { id: "dashboard", title: "DASHBOARD", kind: null },
  {
    id: "whoop",
    title: "WHOOP VITALS",
    kind: null,
    focus: '[data-rowzy-cinematic-panel="whoop-luke"]',
  },
  { id: "analytics", title: "ANALYTICS HUB", kind: "analytics" },
];

/**
 * The starter ships the rooms that render from demo data. The production
 * deck also lists SYSTEMS, JARVIS & AGENTS, B-ROLL STUDIO and the
 * development-only Design Lab.
 */
const TILES: readonly DeckTile[] = DECK_TILES;

/** Which tile carries the current-surface ring for each provider state. */
const TILE_ID_BY_SURFACE_KIND: Partial<
  Record<DashboardSurfaceKind, DeckTileId>
> = {
  dashboard: "dashboard",
  systems: "systems",
  workspace: "jarvis",
  analytics: "analytics",
  youtube: "broll",
  // The person detail surface has no tile, so nothing rings while it is open.
};

/* -- stylized mini-renders: abstract panel skeletons, one per tile ----------- */

const DASH_COLUMNS: readonly (readonly number[])[] = [
  [82, 64, 74, 52],
  [90, 76, 84, 68, 58],
  [70, 58, 66, 46],
];

function DashboardArt() {
  return (
    <span className={styles.artDashboard} aria-hidden>
      {DASH_COLUMNS.map((bars, column) => (
        <span key={column} className={styles.artColumn}>
          <i className={styles.artDot} />
          {bars.map((width, row) => (
            <b key={row} className={styles.artBar} style={{ width: `${width}%` }} />
          ))}
        </span>
      ))}
    </span>
  );
}

const SCHEMATIC_NODES: readonly (readonly [number, number])[] = [
  [16, 20],
  [42, 12],
  [72, 18],
  [104, 26],
  [28, 42],
  [60, 38],
  [92, 48],
  [46, 62],
  [78, 64],
];

const SCHEMATIC_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 4],
  [4, 5],
  [1, 5],
  [5, 6],
  [3, 6],
  [4, 7],
  [5, 8],
  [7, 8],
  [6, 8],
];

function SystemsArt() {
  return (
    <svg className={styles.artSystems} viewBox="0 0 120 74" aria-hidden>
      {SCHEMATIC_EDGES.map(([from, to]) => (
        <line
          key={`${from}-${to}`}
          className={styles.schemEdge}
          x1={SCHEMATIC_NODES[from][0]}
          y1={SCHEMATIC_NODES[from][1]}
          x2={SCHEMATIC_NODES[to][0]}
          y2={SCHEMATIC_NODES[to][1]}
        />
      ))}
      {SCHEMATIC_NODES.map(([x, y], index) => (
        <circle key={index} className={styles.schemNode} cx={x} cy={y} r={2.3} />
      ))}
    </svg>
  );
}

const CHAT_LINES: readonly { side: "user" | "ai"; width: number }[] = [
  { side: "user", width: 52 },
  { side: "ai", width: 74 },
  { side: "user", width: 40 },
  { side: "ai", width: 66 },
];

const LIBRARY_ROWS: readonly number[] = [78, 62, 84, 56, 70];

function JarvisArt() {
  return (
    <span className={styles.artJarvis} aria-hidden>
      <span className={styles.artChatPane}>
        {CHAT_LINES.map((line, index) => (
          <b
            key={index}
            className={styles.artChatLine}
            data-side={line.side}
            style={{ width: `${line.width}%` }}
          />
        ))}
      </span>
      <span className={styles.artLibraryPane}>
        {LIBRARY_ROWS.map((width, index) => (
          <span key={index} className={styles.artLibraryRow}>
            <i />
            <b style={{ width: `${width}%` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Platform accent triplets for the analytics mini-render (YT / IG / TT). */
const ANALYTICS_ACCENTS: readonly string[] = [
  "255 47 77",
  "214 77 255",
  "25 230 241",
];

const HUB_BARS: readonly (readonly number[])[] = [
  [58, 84, 66, 92],
  [46, 70, 54, 78],
  [64, 88, 72, 96],
];

function AnalyticsArt() {
  return (
    <span className={styles.artAnalytics} aria-hidden>
      {ANALYTICS_ACCENTS.map((rgb, column) => (
        <span
          key={rgb}
          className={styles.artPlatformCol}
          style={{ "--accent": `rgb(${rgb})` } as CSSProperties}
        >
          <i className={styles.artAccentDot} />
          <span className={styles.artBarRow}>
            {HUB_BARS[column].map((height, index) => (
              <b key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
          <b className={styles.artBar} style={{ width: "72%" }} />
          <b className={styles.artBar} style={{ width: "54%" }} />
        </span>
      ))}
    </span>
  );
}

const BROLL_SEGMENTS: readonly { left: number; width: number }[] = [
  { left: 0, width: 26 },
  { left: 30, width: 18 },
  { left: 52, width: 30 },
];

function BrollArt() {
  return (
    <span className={styles.artBroll} aria-hidden>
      <span className={styles.brollShelf}>
        {[0, 1, 2, 3].map((clip) => (
          <i
            key={clip}
            className={styles.brollClip}
            data-live={clip === 0 ? "true" : undefined}
          />
        ))}
      </span>
      <span className={styles.brollTimeline}>
        {BROLL_SEGMENTS.map((segment, index) => (
          <b
            key={index}
            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
          />
        ))}
        <i className={styles.brollPlayhead} style={{ left: "44%" }} />
      </span>
    </span>
  );
}

function DesignLabArt() {
  return (
    <span className={styles.artLab} aria-hidden>
      <span className={styles.labSwatches}>
        {[0, 1, 2, 3].map((step) => (
          <i key={step} data-step={step} />
        ))}
      </span>
      <span className={styles.labLadder}>
        {[0, 1, 2].map((step) => (
          <b key={step} data-step={step} />
        ))}
      </span>
    </span>
  );
}

/** WHOOP vitals mini-render: the recovery ring beside disciplined metric rows. */
function WhoopArt() {
  return (
    <span className={styles.artWhoop} aria-hidden="true">
      <i className={styles.artRing} />
      <span className={styles.artColumn}>
        <i className={styles.artBar} style={{ width: "82%" }} />
        <i className={styles.artBar} style={{ width: "64%" }} />
        <i className={styles.artBar} style={{ width: "73%" }} />
        <i className={styles.artBar} style={{ width: "48%" }} />
      </span>
    </span>
  );
}

function TileArt({ id }: { id: DeckTileId }) {
  switch (id) {
    case "dashboard":
      return <DashboardArt />;
    case "whoop":
      return <WhoopArt />;
    case "systems":
      return <SystemsArt />;
    case "jarvis":
      return <JarvisArt />;
    case "analytics":
      return <AnalyticsArt />;
    case "broll":
      return <BrollArt />;
    case "design-lab":
      return <DesignLabArt />;
  }
}

/* -- the deck ----------------------------------------------------------------- */

type DeckPhase = "closed" | "opening" | "deck" | "closing";

export function MissionDeckNav() {
  const { surface, open, close } = useDashboardSurface();
  const [phase, setPhase] = useState<DeckPhase>("closed");
  const [charge, setCharge] = useState(0);

  const overscroll = useRef<OverscrollState>(OVERSCROLL_IDLE);
  const touchY = useRef<number | null>(null);
  /** Whatever had focus before the deck rose; focus returns there on close. */
  const openerRef = useRef<HTMLElement | null>(null);
  const tileRefs = useRef(new Map<DeckTileId, HTMLButtonElement>());

  const currentTileId = TILE_ID_BY_SURFACE_KIND[surface.kind] ?? null;

  const openDeck = useCallback(() => {
    overscroll.current = OVERSCROLL_IDLE;
    setCharge(0);
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setPhase(prefersInstant() ? "deck" : "opening");
  }, []);

  const closeDeck = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    setPhase(prefersInstant() ? "closed" : "closing");
  }, []);

  /**
   * Tiles travel through the existing provider, never around it: the deck is
   * put away first (restoring focus, so the provider records the right
   * control to return to), then the provider plays its own pinned slide-over
   * travel. Selecting the room already open just puts the deck away —
   * repeating the same open() would toggle that surface closed.
   */
  const selectTile = (tile: DeckTile) => {
    if (phase !== "deck") return;
    closeDeck();
    if (tile.href) {
      window.location.assign(tile.href);
      return;
    }
    if (tile.kind === null) {
      if (surface.kind !== "dashboard") close();
      if (tile.focus) focusDashboardPanel(tile.focus);
      return;
    }
    if (surface.kind !== tile.kind) open({ kind: tile.kind });
  };

  /* The zoom phases resolve on the lab's clock, plus a beat. */
  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = window.setTimeout(
      () => setPhase(phase === "opening" ? "deck" : "closed"),
      DECK_ZOOM_MS + 60,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  /* Keyboard users land on the current room's tile once the deck settles. */
  useEffect(() => {
    if (phase !== "deck") return;
    const tile =
      tileRefs.current.get(currentTileId ?? "dashboard") ??
      tileRefs.current.get("dashboard");
    tile?.focus({ preventScroll: true });
  }, [phase, currentTileId]);

  /* ESC closes the deck — captured ahead of the provider's bubble listener so
     one press puts the deck away without also closing the surface beneath it.
     When the assistant's answer card is up it is the topmost layer, so ESC is
     left alone for the card's own listener to handle. */
  useEffect(() => {
    if (phase !== "deck") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (modalCardIsOpen()) return;
      event.stopImmediatePropagation();
      closeDeck();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, closeDeck]);

  /* The gesture, attached at the shell level: wheel and touch deltas anywhere
     in the window feed the accumulator, gated by the active scroll chain
     being at its start. Listeners exist only while the deck is down. */
  useEffect(() => {
    if (phase !== "closed") return;

    const feed = (delta: number, target: EventTarget | null) => {
      // Never charge underneath the assistant's modal answer card.
      if (modalCardIsOpen()) {
        overscroll.current = OVERSCROLL_IDLE;
        setCharge(0);
        return;
      }
      const result = feedOverscroll(overscroll.current, {
        delta,
        atTop: scrollableChainAtTop(target),
        now: Date.now(),
      });
      overscroll.current = result.state;
      if (result.open) {
        openDeck();
        return;
      }
      setCharge(result.charge);
    };

    const onWheel = (event: WheelEvent) => {
      const page = document.scrollingElement ?? document.documentElement;
      feed(
        wheelDeltaPixels(event.deltaY, event.deltaMode, page.clientHeight || 400),
        event.target,
      );
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (y === undefined || touchY.current === null) return;
      feed(touchY.current - y, event.target);
      touchY.current = y;
    };
    const onTouchEnd = () => {
      touchY.current = null;
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase, openDeck]);

  /* An abandoned charge drains: the same window that staleness uses. */
  useEffect(() => {
    if (charge === 0) return;
    const timer = window.setTimeout(() => {
      overscroll.current = OVERSCROLL_IDLE;
      setCharge(0);
    }, OVERSCROLL_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [charge]);

  const deckUp = phase !== "closed";

  return (
    <>
      {/* The operator removed the visible DECK tab: the deep upward
          over-scroll gesture is the only way in. Deliberate, not
          discoverable. */}

      {phase === "closed" && charge > 0 && (
        <div className={styles.chargeRail} aria-hidden>
          <span className={styles.chargeTrack}>
            <i style={{ width: `${Math.round(charge * 100)}%` }} />
          </span>
          <b>MISSION DECK</b>
        </div>
      )}

      {deckUp && (
        <div
          className={styles.deck}
          data-phase={phase}
          aria-label="Mission deck surface overview"
        >
          <button
            type="button"
            className={styles.backdrop}
            onClick={() => {
              if (phase === "deck") closeDeck();
            }}
            aria-label="Close the deck"
            tabIndex={-1}
          />
          <span className={styles.deckTitle}>MISSION DECK · ALL SURFACES</span>
          <div className={styles.tileGrid}>
            {TILES.map((tile) => (
              <button
                key={tile.id}
                type="button"
                ref={(el) => {
                  if (el) tileRefs.current.set(tile.id, el);
                  else tileRefs.current.delete(tile.id);
                }}
                className={styles.tile}
                data-current={tile.id === currentTileId ? "true" : undefined}
                aria-current={tile.id === currentTileId ? "true" : undefined}
                onClick={() => selectTile(tile)}
              >
                <span className={styles.tileFrame}>
                  <TileArt id={tile.id} />
                </span>
                <span className={styles.tileTitle}>{tile.title}</span>
              </button>
            ))}
          </div>
          {/* 2026-08-19: the operator asked for Clap mode here — a slim,
              quiet row under the tiles with room for future toggles. */}
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>MODES</span>
            <ClapMode />
          </div>
          <span className={styles.deckHint}>
            CLICK A TILE TO TRAVEL THERE · ESC OR BACKDROP TO RETURN
          </span>
        </div>
      )}
    </>
  );
}
