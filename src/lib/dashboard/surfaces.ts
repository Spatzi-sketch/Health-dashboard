/**
 * The dashboard's expanded-surface coordinator.
 *
 * The dashboard has exactly one expanded surface at a time. Before this
 * module, each surface mutated its own document attribute directly, so two
 * components could each believe they owned the page. Here the whole document
 * state is a pure function of one value, which makes exclusivity structural
 * rather than something every component has to remember.
 *
 * The cinematic presentation is deliberately *not* one of these surfaces. It
 * owns `data-rowzy-cinematic` itself and is protected work; this module yields
 * to it by listening for the event it already dispatches.
 */

import type { Person } from "@/lib/whoop/contract";

export const DASHBOARD_SURFACE_KINDS = [
  "dashboard",
  "workspace",
  "systems",
  "progress",
  "youtube",
  "analytics",
] as const;

export type DashboardSurfaceKind = (typeof DASHBOARD_SURFACE_KINDS)[number];

/**
 * The active surface. `dashboard` is the resting state — the normal grid with
 * nothing expanded.
 */
export type DashboardSurface =
  | { kind: "dashboard" }
  | { kind: "workspace" }
  | { kind: "systems" }
  | { kind: "progress"; person: Person }
  | { kind: "youtube" }
  | { kind: "analytics" };

export const DASHBOARD_SURFACE: DashboardSurface = { kind: "dashboard" };

export type SurfaceRequest =
  | { type: "open"; surface: DashboardSurface }
  | { type: "close" }
  /** Close only if the named kind is the one currently open. */
  | { type: "close-kind"; kind: DashboardSurfaceKind }
  /** The protected cinematic took the page; every surface stands down. */
  | { type: "yield" };

export function isExpanded(surface: DashboardSurface): boolean {
  return surface.kind !== "dashboard";
}

export function sameSurface(
  left: DashboardSurface,
  right: DashboardSurface,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "progress" && right.kind === "progress") {
    return left.person === right.person;
  }
  return true;
}

/**
 * The next surface for a request.
 *
 * Opening always replaces whatever was open, so a second surface can never be
 * additive. Re-opening the surface already showing is a toggle back to the
 * dashboard, which is what a repeated click on the same control should mean.
 */
export function reduceSurface(
  current: DashboardSurface,
  request: SurfaceRequest,
): DashboardSurface {
  switch (request.type) {
    case "open":
      return sameSurface(current, request.surface)
        ? DASHBOARD_SURFACE
        : request.surface;
    case "close":
      return DASHBOARD_SURFACE;
    case "close-kind":
      return current.kind === request.kind ? DASHBOARD_SURFACE : current;
    case "yield":
      return DASHBOARD_SURFACE;
  }
}

/**
 * The complete set of document attributes for a surface.
 *
 * `rowzyWorkspace` is kept as its own attribute because the workspace reflow
 * and its CSS predate this coordinator and are covered by existing tests.
 * Everything else keys off `rowzySurface`.
 */
export interface SurfaceDocumentState {
  rowzyWorkspace: "active" | null;
  rowzySurface: "systems" | "progress" | "youtube" | "analytics" | null;
  rowzyProgressPerson: Person | null;
}

export function surfaceDocumentState(
  surface: DashboardSurface,
): SurfaceDocumentState {
  return {
    rowzyWorkspace: surface.kind === "workspace" ? "active" : null,
    rowzySurface:
      surface.kind === "systems" ||
      surface.kind === "progress" ||
      surface.kind === "youtube" ||
      surface.kind === "analytics"
        ? surface.kind
        : null,
    rowzyProgressPerson: surface.kind === "progress" ? surface.person : null,
  };
}

/**
 * Write one surface's state to the document element.
 *
 * Every key is always either set or removed, so no attribute can survive from
 * a previously open surface and leave two reflows fighting in CSS.
 */
export function applySurfaceState(
  root: { dataset: DOMStringMap },
  surface: DashboardSurface,
): void {
  const state = surfaceDocumentState(surface);
  for (const [key, value] of Object.entries(state)) {
    if (value === null) delete root.dataset[key];
    else root.dataset[key] = value;
  }
}

/** Clear every attribute this coordinator owns. */
export function clearSurfaceState(root: { dataset: DOMStringMap }): void {
  applySurfaceState(root, DASHBOARD_SURFACE);
}

/** The accessible label for the control that returns to the dashboard. */
export const BACK_TO_DASHBOARD_LABEL = "Back to dashboard";
