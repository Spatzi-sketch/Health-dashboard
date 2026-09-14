"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AMAZFIT_STORAGE_KEY,
  demoAmazfitMetrics,
  fieldHistory,
  latestDay,
  parseAmazfitImport,
  type AmazfitDay,
  type AmazfitMetrics,
} from "@/features/dashboard/amazfit";
import styles from "./amazfit-connection-card.module.css";

function compact(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMinutes(total: number | null): string {
  if (total === null) return "—";
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

interface StatTile {
  key: string;
  label: string;
  value: string;
  unit: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
}

function signedDelta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "—";
  const change = Math.round(current - previous);
  if (change === 0) return "±0";
  return `${change > 0 ? "+" : ""}${change}`;
}

function buildTiles(days: AmazfitDay[]): StatTile[] {
  const latest = latestDay(days);
  const previous = days.length >= 2 ? days[days.length - 2] : null;
  const pick = (
    field: keyof AmazfitDay,
  ): { value: number | null; delta: string } => ({
    value: (latest?.[field] as number | null) ?? null,
    delta:
      previous === null
        ? "—"
        : signedDelta(
            (latest?.[field] as number | null) ?? null,
            (previous[field] as number | null) ?? null,
          ),
  });

  const steps = pick("steps");
  const heart = pick("heartRate");
  const sleep = pick("sleepMinutes");
  const pai = pick("pai");
  const spo2 = pick("spo2");
  const stress = pick("stress");

  return [
    {
      key: "steps",
      label: "Steps",
      value: compact(steps.value),
      unit: "steps",
      delta: steps.delta,
      tone: "neutral",
    },
    {
      key: "heart",
      label: "Heart rate",
      value: compact(heart.value),
      unit: "bpm",
      delta: heart.delta,
      tone:
        heart.value !== null && heart.value < 70 ? "positive" : "neutral",
    },
    {
      key: "sleep",
      label: "Sleep",
      value: formatMinutes(sleep.value),
      unit: "",
      delta: sleep.delta,
      tone: "neutral",
    },
    {
      key: "pai",
      label: "PAI",
      value: compact(pai.value),
      unit: "pts",
      delta: pai.delta,
      tone: pai.value !== null && pai.value >= 60 ? "positive" : "neutral",
    },
    {
      key: "spo2",
      label: "SpO₂",
      value: compact(spo2.value, 1),
      unit: "%",
      delta: spo2.delta,
      tone: spo2.value !== null && spo2.value >= 95 ? "positive" : "negative",
    },
    {
      key: "stress",
      label: "Stress",
      value: compact(stress.value),
      unit: "/100",
      delta: stress.delta,
      tone: stress.value !== null && stress.value <= 40 ? "positive" : "negative",
    },
  ];
}

function Sparkline({ values }: { values: number[] }) {
  const width = 220;
  const height = 48;
  const stroke = "var(--vitals-amber)";
  if (values.length < 2) {
    return <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 4 - ((value - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = `${points[0]} ${line} ${width},${height} 0,${height}`;
  const gradientId = "amazfit-spark-fill";
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--vitals-amber)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--vitals-amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AmazfitConnectionCard({
  referenceTimeIso,
}: {
  referenceTimeIso: string;
}) {
  const demo = useMemo(
    () => demoAmazfitMetrics(referenceTimeIso),
    [referenceTimeIso],
  );
  const [metrics, setMetrics] = useState<AmazfitMetrics>(demo);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AMAZFIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AmazfitMetrics;
        if (Array.isArray(parsed.days) && parsed.days.length > 0) {
          setMetrics({ ...parsed, source: "import" });
        }
      }
    } catch {
      // Corrupt or absent storage → keep demo data.
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: AmazfitMetrics) => {
    setMetrics(next);
    try {
      window.localStorage.setItem(AMAZFIT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full/unavailable — keep it in memory for this session.
    }
  }, []);

  const applyImport = useCallback(
    (text: string) => {
      const days = parseAmazfitImport(text);
      if (!days) {
        setError(
          "Could not read that data. Paste JSON with a `days` array, or a CSV with a `date` column plus metric columns (steps, heart_rate, sleep_minutes, pai, spo2, stress…).",
        );
        return;
      }
      setError(null);
      persist({
        source: "import",
        importedAt: new Date().toISOString(),
        days,
      });
      setPanelOpen(false);
      setDraft("");
    },
    [persist],
  );

  const loadSample = useCallback(() => {
    fetch("/amazfit-sample.json")
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (text) applyImport(text);
        else setError("Sample data could not be loaded.");
      })
      .catch(() => setError("Sample data could not be loaded."));
  }, [applyImport]);

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => applyImport(String(reader.result ?? ""));
      reader.onerror = () => setError("Could not read that file.");
      reader.readAsText(file);
    },
    [applyImport],
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(AMAZFIT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setMetrics(demo);
  }, [demo]);

  const isImported = metrics.source === "import";
  const latest = latestDay(metrics.days);
  const stepsHistory = useMemo(
    () => fieldHistory(metrics.days, "steps").slice(-14),
    [metrics.days],
  );
  const tiles = useMemo(() => buildTiles(metrics.days), [metrics.days]);

  return (
    <article
      className={styles.dashboard}
      data-source={isImported ? "import" : "demo"}
      aria-label="Amazfit vitals"
    >
      <section className={styles.deck}>
        <header className={styles.header}>
          <div>
            <p className={styles.name}>YOU</p>
            <p className={styles.subtitle}>AMAZFIT · ZEPP NODE</p>
            <p className={styles.code}>AMZ-01 · LOCAL IMPORT</p>
          </div>
          <div className={styles.signals}>
            {!isImported ? <span className={styles.demoChip}>DEMO</span> : null}
            <p className={styles.statusChip} data-status={isImported ? "imported" : "demo"}>
              <StatusIcon connected={isImported} />
              {isImported ? "IMPORTED" : "DEMO DATA"}
            </p>
            <p className={styles.synced}>
              {isImported && metrics.importedAt
                ? `IMPORTED ${new Date(metrics.importedAt).toLocaleString()}`
                : latest
                  ? `LATEST ${latest.date}`
                  : "NO DATA"}
            </p>
          </div>
        </header>

        <div className={styles.grid}>
          {tiles.map((tile) => (
            <div key={tile.key} className={styles.tile}>
              <p className={styles.tileLabel}>{tile.label}</p>
              <p className={styles.tileValue}>
                {tile.value}
                {tile.unit ? <span className={styles.tileUnit}>{tile.unit}</span> : null}
              </p>
              <p className={styles.tileDelta} data-tone={tile.tone}>
                {tile.delta === "—" ? "BASELINE" : `${tile.delta} vs prior`}
              </p>
            </div>
          ))}
        </div>

        <div className={styles.trend}>
          <div className={styles.trendHead}>
            <span>STEPS · 14 DAYS</span>
            <span>{compact(latest?.steps ?? null)} today</span>
          </div>
          <Sparkline values={stepsHistory} />
        </div>

        <footer className={styles.footer}>
          <p className={styles.footerNote}>
            Amazfit has no public OAuth API — connect by importing your own
            Zepp export. Data stays in this browser.
          </p>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setPanelOpen((open) => !open)}
            >
              {isImported ? "Replace data" : "Connect Amazfit"}
            </button>
            {isImported ? (
              <button type="button" className={styles.ghostButton} onClick={clear}>
                Clear
              </button>
            ) : null}
          </div>
        </footer>

        {panelOpen ? (
          <div className={styles.panel} role="dialog" aria-label="Import Amazfit data">
            <p className={styles.panelTitle}>Connect your Amazfit data</p>
            <ol className={styles.steps}>
              <li>
                Open the Zepp app → Profile → Security &amp; Privacy → User
                Rights → <strong>Export Data</strong>. You&apos;ll get an email
                with your data archive.
              </li>
              <li>
                Drop the exported <strong>JSON or CSV</strong> below, or paste
                its contents.
              </li>
            </ol>
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv,text/plain"
              className={styles.fileInput}
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <textarea
              className={styles.textarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="…or paste JSON / CSV here"
              rows={6}
            />
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => applyImport(draft)}
                disabled={draft.trim().length === 0}
              >
                Import pasted data
              </button>
              <button type="button" className={styles.ghostButton} onClick={loadSample}>
                Load sample
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Quiet marker so the card never flashes empty before hydration. */}
      {!hydrated ? <span className={styles.hydrationGuard} aria-hidden="true" /> : null}
    </article>
  );
}

function StatusIcon({ connected }: { connected: boolean }) {
  return (
    <svg
      className={styles.statusIcon}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      {connected ? (
        <path
          d="M2 5.2 4.1 7.3 8 3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}
