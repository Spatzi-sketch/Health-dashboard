"use client";

/**
 * The one place that decides which dashboard surface is expanded.
 *
 * Before this, each surface set its own document attribute, so two of them
 * could believe they owned the page at once. Now every surface asks this
 * provider, the provider holds a single value, and the document attributes are
 * a pure function of that value — exclusivity is structural rather than
 * something each component has to remember.
 *
 * It also owns the two behaviours every surface needs and none should
 * re-implement: Escape returns to the dashboard, and closing puts keyboard
 * focus back on the control that opened the surface.
 *
 * 2026-08-19: the operator asked for instant navigation ("remove all
 * animations when going on a new page … I don't want wait times"). The
 * surface travel — the 640ms clock, the two-leg journey between expanded
 * surfaces, and the leaving-overlay attribute — was removed. Opening or
 * closing a surface is now one synchronous state change; content appears
 * immediately.
 *
 * The cinematic presentation is protected work and keeps its own attribute.
 * This provider does not touch it; it listens for the change event the
 * presentation already dispatches and stands every surface down, so a
 * cinematic can never play underneath an expanded surface.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DASHBOARD_SURFACE,
  applySurfaceState,
  clearSurfaceState,
  isExpanded,
  reduceSurface,
  sameSurface,
  type DashboardSurface,
  type DashboardSurfaceKind,
} from "@/lib/dashboard/surfaces";
import type { Person } from "@/lib/whoop/contract";

interface SurfaceContextValue {
  surface: DashboardSurface;
  open: (surface: DashboardSurface) => void;
  close: () => void;
  closeKind: (kind: DashboardSurfaceKind) => void;
  isOpen: (surface: DashboardSurface) => boolean;
}

const SurfaceContext = createContext<SurfaceContextValue | null>(null);

export function DashboardSurfaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [surface, setSurface] = useState<DashboardSurface>(DASHBOARD_SURFACE);
  // The control that opened the current surface, so Back and Escape can return
  // the operator to exactly where they were.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<DashboardSurface>(surface);

  useEffect(() => {
    surfaceRef.current = surface;
  }, [surface]);

  const open = useCallback((next: DashboardSurface) => {
    const current = surfaceRef.current;
    const resolved = reduceSurface(current, { type: "open", surface: next });
    // Only a journey out from the dashboard captures a restore target: on a
    // direct switch between expanded surfaces the original dashboard control
    // is still the honest place for focus to return to.
    if (isExpanded(resolved) && !isExpanded(current)) {
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    }
    setSurface(resolved);
  }, []);

  const close = useCallback(() => {
    setSurface(reduceSurface(surfaceRef.current, { type: "close" }));
  }, []);

  const closeKind = useCallback((kind: DashboardSurfaceKind) => {
    setSurface(reduceSurface(surfaceRef.current, { type: "close-kind", kind }));
  }, []);

  // One writer for the document attributes. Every key is set or removed on
  // every change, so no attribute survives from a surface that has closed.
  useEffect(() => {
    const root = document.documentElement;
    applySurfaceState(root, surface);
    return () => {
      clearSurfaceState(root);
    };
  }, [surface]);

  // Returning to the dashboard restores focus to the opening control.
  const expanded = isExpanded(surface);
  useEffect(() => {
    if (expanded) return;
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target?.isConnected) {
      // After the reflow has committed, so focus does not fight the layout.
      const frame = window.requestAnimationFrame(() =>
        target.focus({ preventScroll: true }),
      );
      return () => window.cancelAnimationFrame(frame);
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close, expanded]);

  // Yield to the protected cinematic presentation, which owns its own
  // attribute and must never share the page with an expanded surface.
  useEffect(() => {
    const onCinematicChange = () => {
      if (document.documentElement.dataset.rowzyCinematic === "active") {
        setSurface((current) => reduceSurface(current, { type: "yield" }));
      }
    };
    window.addEventListener("rowzy:cinematic-change", onCinematicChange);
    return () =>
      window.removeEventListener("rowzy:cinematic-change", onCinematicChange);
  }, []);

  const value = useMemo<SurfaceContextValue>(
    () => ({
      surface,
      open,
      close,
      closeKind,
      isOpen: (candidate: DashboardSurface) => sameSurface(surface, candidate),
    }),
    [close, closeKind, open, surface],
  );

  return (
    <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
  );
}

/**
 * Surface state for a component inside the provider.
 *
 * Falls back to an inert dashboard-only implementation when no provider is
 * present, so a component rendered outside the dashboard cannot crash and
 * cannot silently take the page over either.
 */
export function useDashboardSurface(): SurfaceContextValue {
  const context = useContext(SurfaceContext);
  return (
    context ?? {
      surface: DASHBOARD_SURFACE,
      open: () => {},
      close: () => {},
      closeKind: () => {},
      isOpen: (candidate: DashboardSurface) =>
        candidate.kind === "dashboard",
    }
  );
}

export function useProgressSurface(person: Person) {
  const { surface, open, close } = useDashboardSurface();
  return {
    active: surface.kind === "progress" && surface.person === person,
    open: useCallback(
      () => open({ kind: "progress", person }),
      [open, person],
    ),
    close,
  };
}
