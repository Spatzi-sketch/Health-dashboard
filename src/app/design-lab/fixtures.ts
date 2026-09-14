/**
 * Analytics Hub fixture snapshot.
 *
 * Trimmed from the full design-lab fixture catalog: the starter keeps only
 * the exports the Analytics Hub and Retention Theatre actually render.
 * Every number here is demo data and is labelled FIXTURE in the UI.
 */

export type HubTone = "positive" | "negative" | "neutral";

export interface HubMetric {
  label: string;
  value: string;
  delta: string;
  tone: HubTone;
  /** Sparkline series; empty means no usable history yet. */
  series: readonly number[];
}

export interface HubPlatform {
  id: "youtube" | "instagram" | "tiktok";
  label: string;
  code: string;
  /** Platform accent as an "R G B" triplet (same idiom as the social gallery). */
  rgb: string;
  audienceLabel: string;
  audience: string;
  audienceDelta: string;
  metrics: readonly HubMetric[];
  /** 30-day audience trend, 2-day samples, raw values for the overlay. */
  series30: readonly number[];
}

export const HUB_PLATFORMS: readonly HubPlatform[] = [
  {
    id: "youtube",
    label: "YouTube",
    code: "YT",
    rgb: "255 47 77",
    audienceLabel: "SUBSCRIBERS",
    audience: "12,408",
    audienceDelta: "+312 · 30D",
    metrics: [
      {
        label: "30D VIEWS",
        value: "84,120",
        delta: "+9.4%",
        tone: "positive",
        series: [52, 55, 54, 58, 61, 60, 63, 66, 64, 69, 72, 76],
      },
      {
        label: "WATCH TIME",
        value: "3,120 H",
        delta: "+6.1%",
        tone: "positive",
        series: [40, 42, 41, 45, 44, 47, 49, 48, 52, 54, 53, 57],
      },
      {
        label: "ENGAGEMENT",
        value: "4.8%",
        delta: "+0.3",
        tone: "positive",
        series: [30, 31, 29, 33, 34, 32, 35, 36, 35, 37, 38, 39],
      },
      {
        label: "AVG VIEW LENGTH",
        value: "4:12",
        delta: "-0:07",
        tone: "negative",
        series: [46, 45, 47, 44, 45, 43, 44, 42, 43, 41, 42, 41],
      },
    ],
    series30: [
      12096, 12110, 12131, 12140, 12163, 12181, 12178, 12204, 12229, 12241,
      12266, 12287, 12305, 12341, 12377, 12408,
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    code: "IG",
    rgb: "214 77 255",
    audienceLabel: "FOLLOWERS",
    audience: "8,116",
    audienceDelta: "+141 · 30D",
    metrics: [
      {
        label: "30D REACH",
        value: "46,300",
        delta: "+4.2%",
        tone: "positive",
        series: [58, 60, 57, 61, 63, 62, 64, 63, 66, 65, 67, 69],
      },
      {
        label: "INTERACTIONS",
        value: "5,870",
        delta: "-1.8%",
        tone: "negative",
        series: [52, 50, 51, 49, 50, 48, 49, 47, 48, 46, 47, 46],
      },
      {
        label: "ENGAGEMENT",
        value: "3.1%",
        delta: "±0.0",
        tone: "neutral",
        series: [31, 31, 32, 31, 30, 31, 31, 32, 31, 31, 30, 31],
      },
      {
        label: "PROFILE VIEWS",
        value: "2,940",
        delta: "+7.6%",
        tone: "positive",
        series: [24, 25, 24, 26, 27, 26, 28, 29, 28, 30, 31, 32],
      },
    ],
    series30: [
      7975, 7981, 7990, 7996, 8004, 8012, 8010, 8021, 8033, 8040, 8051, 8062,
      8074, 8088, 8101, 8116,
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    code: "TK",
    rgb: "25 230 241",
    audienceLabel: "FOLLOWERS",
    audience: "21,930",
    audienceDelta: "+1,204 · 30D",
    metrics: [
      {
        label: "30D VIEWS",
        value: "128,400",
        delta: "+18.2%",
        tone: "positive",
        series: [38, 41, 40, 46, 51, 49, 55, 61, 58, 66, 71, 78],
      },
      {
        label: "WATCH TIME",
        value: "—",
        delta: "12/30D OBSERVED",
        tone: "neutral",
        series: [],
      },
      {
        label: "ENGAGEMENT",
        value: "6.2%",
        delta: "+0.8",
        tone: "positive",
        series: [44, 45, 47, 46, 49, 51, 50, 53, 55, 54, 57, 59],
      },
      {
        label: "SHARES",
        value: "3,410",
        delta: "+22.5%",
        tone: "positive",
        series: [20, 22, 21, 25, 28, 27, 32, 35, 34, 39, 43, 47],
      },
    ],
    series30: [
      20726, 20780, 20851, 20899, 20984, 21055, 21042, 21138, 21231, 21290,
      21398, 21486, 21571, 21699, 21812, 21930,
    ],
  },
] as const;

/** Hero strip totals — sums and deltas of the platform fixture values. */
export const HUB_TOTALS = {
  audience: "42,454",
  delta: "+1,657 · 30D",
  window: "30-DAY WINDOW · 2-DAY SAMPLES",
  /** Combined audience across platforms, same sampling as series30. */
  series: [
    40797, 40871, 40972, 41035, 41151, 41248, 41230, 41363, 41493, 41571,
    41715, 41835, 41950, 42128, 42290, 42454,
  ],
} as const;

export interface HubContentItem {
  platform: HubPlatform["id"];
  title: string;
  views: string;
  likes: string;
  comments: string;
}

export const HUB_TOP_CONTENT: readonly HubContentItem[] = [
  { platform: "youtube", title: "Morning routine that fixed my sleep", views: "48,120", likes: "3,904", comments: "212" },
  { platform: "youtube", title: "We tested WHOOP for 30 days", views: "31,850", likes: "2,441", comments: "187" },
  { platform: "youtube", title: "Editing setup tour 2026", views: "18,220", likes: "1,510", comments: "96" },
  { platform: "instagram", title: "Gym PR reel", views: "22,400", likes: "1,982", comments: "143" },
  { platform: "instagram", title: "Behind the dashboard", views: "14,090", likes: "1,204", comments: "88" },
  { platform: "instagram", title: "Week of meals carousel", views: "9,830", likes: "861", comments: "57" },
  { platform: "tiktok", title: "POV: your dashboard talks back", views: "261,000", likes: "24,100", comments: "1,320" },
  { platform: "tiktok", title: "3 signs you are overtraining", views: "142,500", likes: "11,800", comments: "640" },
  { platform: "tiktok", title: "Desk setup in 15 seconds", views: "98,700", likes: "8,300", comments: "402" },
] as const;

/** Best-time-to-post model: 7 days × 24 hours, intensity 0–4 (fixture). */
export const HUB_HEATMAP: {
  days: readonly string[];
  rows: readonly (readonly number[])[];
} = {
  days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  rows: [
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 2, 3, 4, 3, 3, 2, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 1, 2, 3, 4, 4, 4, 3, 2, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 3, 2, 2, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 3, 2, 2, 2, 2, 3, 3, 4, 4, 3, 2, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 4, 3, 3, 2, 2, 2, 3, 4, 4, 3, 2, 1, 0],
  ],
} as const;

/* -- RETENTION THEATRE ------------------------------------------------------ */

export const RETENTION_META = {
  video: "Morning routine that fixed my sleep",
  views: "48,120",
  duration: "8:40",
  durationS: 520,
  avgWatched: "16.2%",
  avgWatchedTime: "1:24",
} as const;

/** Retention samples: seconds in, share still watching (percent). */
export const RETENTION_CURVE: readonly { t: number; pct: number }[] = [
  { t: 0, pct: 100 },
  { t: 8, pct: 84 },
  { t: 15, pct: 76 },
  { t: 25, pct: 68 },
  { t: 35, pct: 62 },
  { t: 45, pct: 57 },
  { t: 60, pct: 52 },
  { t: 75, pct: 47 },
  { t: 85, pct: 44 },
  { t: 90, pct: 41 },
  { t: 96, pct: 33 },
  { t: 104, pct: 28 },
  { t: 112, pct: 26 },
  { t: 130, pct: 24 },
  { t: 160, pct: 22 },
  { t: 200, pct: 20 },
  { t: 260, pct: 18 },
  { t: 340, pct: 16 },
  { t: 420, pct: 14 },
  { t: 520, pct: 12 },
] as const;

export const RETENTION_CLIFF = {
  t: 90,
  from: "44%",
  to: "26%",
  label: "THE 90-SECOND CLIFF",
} as const;

/** Exit density along the runtime, 26 bins of 20 s, intensity 0–4. */
export const RETENTION_EXITS = {
  cells: [1, 2, 1, 1, 4, 4, 3, 2, 1, 1, 2, 1, 1, 1, 0, 1, 1, 0, 1, 2, 1, 0, 1, 1, 2, 1],
  beats: [
    { at: 0, label: "HOOK" },
    { at: 2, label: "INTRO" },
    { at: 4, label: "CLIFF" },
    { at: 10, label: "SEGMENT 2" },
    { at: 19, label: "PAYOFF" },
    { at: 24, label: "OUTRO" },
  ],
} as const;

/** Funnel stages for the subscriber-flow band; shares scale each band. */
export const RETENTION_FLOW: readonly {
  id: string;
  label: string;
  value: string;
  note: string;
  /** Band height as a share of the first stage, 0–100. */
  share: number;
}[] = [
  { id: "views", label: "30D VIEWS", value: "84,120", note: "CTR 4.4% OF 1,924,000 IMPRESSIONS", share: 100 },
  { id: "past-cliff", label: "PAST THE CLIFF", value: "21,870", note: "STILL WATCHING AT 2:00", share: 26 },
  { id: "engaged", label: "ENGAGED", value: "6,730", note: "LIKED · COMMENTED · SAVED", share: 8 },
  { id: "subscribed", label: "SUBSCRIBED", value: "+312", note: "-58 UNSUBSCRIBED SAME WINDOW", share: 2 },
] as const;
