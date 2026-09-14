# Setup guide for AI agents

You are installing the ROWZY Starter for someone who may be new to all of
this. Follow these steps exactly and keep your explanations short and
friendly.

## Install and run

1. Check Node.js is installed: `node --version` (needs **20.9 or newer** —
   what Next.js 16 requires; `package.json` declares it under `engines`).
   If missing or older, help the user install the current LTS from
   nodejs.org before anything else.
2. In this project's folder run:
   ```bash
   npm install
   npm run dev
   ```
3. Tell the user to open **http://localhost:3000** in their browser.
4. The first page load compiles the dashboard; give it a few seconds.

No configuration is needed. There is no `.env` to create, no account to make
and no API key to obtain. If `npm run dev` fails, read the error: the usual
causes are an old Node version or port 3000 being busy. When 3000 is busy,
Next picks the next free port itself and prints the new address — tell the
user to open the printed address. (Note for the WHOOP card later: its OAuth
redirect is registered for port 3000, so free that port before wiring WHOOP.)

## What the user should see

A dark, cinematic dashboard titled **ROWZY** with a SIMULATED FEED chip in
the header (that chip shows only while every tile is still demo):

- Left: a WHOOP vitals rail labeled **YOU** — recovery, strain, sleep and an
  orbital age dial — wearing a small DEMO chip beside its CONNECTED status.
- Right: the social signal core — YouTube, Instagram and TikTok tiles, each
  wearing its own small DEMO chip, with climbing 30-day charts, and a
  progress-photo frame (a placeholder image).
- Clicking the progress frame opens the Progress Detail surface; a firm
  upward scroll while already at the top opens the Mission Deck navigation
  (Dashboard / WHOOP Vitals / Analytics Hub). Scrolling down never opens it.
- In `npm run dev` a small "Preview states" switcher appears bottom-left for
  previewing the WHOOP card's disconnected / syncing / error states.

If the user sees all of that, the install is done.

## Demo chips and how they turn off

Every tile renders demo data and says so with its own chip.
`src/features/dashboard/demo-status.ts` holds the shipped defaults (all
`true` = nothing wired). **Do NOT edit that file to `false`.** The chip
state must be decided at request time in `src/app/page.tsx`: derive a
per-request status object, e.g.

```ts
const tileStatus = { ...demoTileStatus, youtube: youtubeReal === null };
```

so the chip disappears only when this request actually loaded real data.
A wired tile whose fetch fails (bad key, offline, expired token) must show
its DEMO chip again — that honesty is the entire point of the chips. The
header SIMULATED FEED chip derives from the same object and retires as soon
as any one tile is real. Do not remove chips any other way.

## Reserved configuration names

The names below are the **stable contract**; agents and humans must use
exactly these names so connect upgrades drop in cleanly:

| Card | Reserved variable names |
| --- | --- |
| YouTube | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` |
| WHOOP | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` |
| Instagram | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |

Setting these variables on the unmodified starter changes nothing (it ships
with no fetch code); that is expected. Wiring a tile is a connect-agent's
job, done to the guide below.

## Wiring guide — how each tile connects

The starter as shipped performs zero network calls. This is the contract a
connecting agent follows to wire ONE tile at a time to real data.

The codebase idiom (inherited from the production system this starter is
ported from): data is read **server-side** and handed to components as
props. Social platforms get a small server-only module (e.g.
`src/lib/social/youtube.ts`) called from the server component
`src/app/page.tsx` — which currently calls the demo builders; replace
exactly that call site for the tile you wire. WHOOP additionally needs two
**route handlers** for its OAuth handshake (shipped as 501 stubs — see
below). Client components never fetch and never see a key.

**Before wiring any social tile, read these three files in full:**
`src/features/dashboard/social-metrics.ts` (the `SocialPlatformMetrics`
type has ~20 required fields — start from the exported
`emptySocialDashboardMetrics()` builder, never hand-build from scratch),
`src/components/social-metrics-core.tsx` (chip wiring and the separate
`extendedSeries` prop), and `src/app/page.tsx` (the call sites you are
replacing). The tile's 30/90-day charts come from `extendedSeries`, which
is handed to the component separately — if you wire only headline metrics,
the charts remain simulated and you must keep that honest (see YouTube).

**The fail-soft rule (applies to every tile):** if the tile's env vars are
missing, or the fetch fails or returns an invalid payload, the tile MUST
fall back to its demo data with its demo status `true` for that request —
DEMO chip intact, page never crashes, other tiles unaffected. Give every
fetch a timeout (`AbortSignal.timeout(8000)`) so a hanging network also
fails soft instead of stalling the render. The demo status goes `false`
only on the request-time success path (see "Demo chips" above).

### YouTube

- Demo data: `src/features/dashboard/demo-social.ts` — the `youtube` entry
  inside `demoSocialDashboardMetrics()` / `demoSocialExtendedSeries()`.
- Renders in: `src/components/social-metrics-core.tsx` (the YouTube tile of
  the signal stack; the Analytics Hub reads the same metrics object).
- Real fetch belongs: a server-only module (suggested
  `src/lib/social/youtube.ts`) using the YouTube Data API v3
  `channels.list` endpoint, called from `src/app/page.tsx`. **Honesty
  limits of an API key:** `channels.list` returns a ROUNDED
  `subscriberCount` (set `headlinePrecision` to `'rounded'`) and lifetime
  `viewCount` only — the daily views series requires OAuth (YouTube
  Analytics API), which an API key cannot reach. So: wire the headline
  numbers real, leave `extendedSeries` on demo data, and relabel the
  tile's chart caption to say simulated history. Do not attempt the
  Analytics endpoints with an API key; you will get 401s. Start from
  `emptySocialDashboardMetrics()` and fill the `youtube` entry only.
- Env vars (in `.env.local`): `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`.
- On success: request-time demo status `false` for `youtube` (headline is
  real; chart caption says simulated). On any failure: demo data, status
  stays `true`.

### WHOOP

- Demo data: `src/features/dashboard/demo-whoop.ts` —
  `demoWhoopConnection()` (plus the weight/photo/workout inputs the
  Progress Detail composes from).
- Renders in: `src/components/whoop-connection-card.tsx` (the YOU panel).
- Real fetch belongs: WHOOP requires OAuth, wired in three parts, all
  server-side:
  1. **`/api/whoop/connect`** (`src/app/api/whoop/connect/route.ts`, ships
     as a 501 stub): build the WHOOP authorize URL
     (`https://api.prod.whoop.com/oauth/oauth2/auth`) with
     `client_id=WHOOP_CLIENT_ID`,
     `redirect_uri=http://localhost:3000/api/whoop/callback`,
     `response_type=code`, the WHOOP read scopes, and a random `state`
     stored in an HttpOnly cookie; respond with a 302 redirect to it. The
     redirect URI registered in the WHOOP developer dashboard must match
     exactly.
  2. **`/api/whoop/callback`** (`src/app/api/whoop/callback/route.ts`,
     ships as a 501 stub): verify `state` against the cookie, exchange the
     `code` at `https://api.prod.whoop.com/oauth/oauth2/token` using
     `WHOOP_CLIENT_ID` + `WHOOP_CLIENT_SECRET`, store the token pair
     **server-side only** — never sent to the browser, never logged, never
     embedded in a page — then redirect to `/`.
  3. A server-only sync module (suggested `src/lib/whoop/sync.ts`) that
     uses the stored token to read cycles/recovery/sleep and builds a
     `WhoopConnection` (type in
     `src/features/dashboard/whoop-fixtures.ts`), called from
     `src/app/page.tsx` where `demoWhoopConnection` is called today. The
     card's "Connect WHOOP" affordance already links to
     `/api/whoop/connect`.
- Env vars (in `.env.local`): `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`.
- On success: request-time demo status `false` for `whoop`. On any failure
  (including an expired token): demo data, status stays `true`.

### Instagram

- Demo data: `src/features/dashboard/demo-social.ts` — the `instagram`
  entry inside `demoSocialDashboardMetrics()` /
  `demoSocialExtendedSeries()`.
- Renders in: `src/components/social-metrics-core.tsx` (the Instagram
  tile).
- Real fetch belongs: a server-only module (suggested
  `src/lib/social/instagram.ts`) using the Instagram Graph API
  (`/{ig-user-id}?fields=followers_count` and the `insights` edge for
  reach), called from `src/app/page.tsx`; build a `SocialPlatformMetrics`
  and merge it over the demo metrics for the `instagram` key only.
- Env vars (in `.env.local`): `INSTAGRAM_ACCESS_TOKEN`,
  `INSTAGRAM_USER_ID`.
- On success: request-time demo status `false` for `instagram`. On any
  failure: demo data, status stays `true`.

### TikTok

- Demo data: `src/features/dashboard/demo-social.ts` — the `tiktok` entry
  inside `demoSocialDashboardMetrics()` / `demoSocialExtendedSeries()`.
- Renders in: `src/components/social-metrics-core.tsx` (the TikTok tile).
- Real fetch belongs: a server-only module (suggested
  `src/lib/social/tiktok.ts`) using the TikTok for Developers display API
  (`/v2/user/info/` for follower count, `/v2/video/list/` for views).
  TikTok also uses OAuth — if a user-consent flow is needed, follow the
  same route-handler pattern as WHOOP. Called from `src/app/page.tsx`;
  build a `SocialPlatformMetrics` and merge it over the demo metrics for
  the `tiktok` key only.
- Env vars (in `.env.local`): `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
- On success: request-time demo status `false` for `tiktok`. On any
  failure: demo data, status stays `true`.

### Amazfit

- Demo data: `src/features/dashboard/amazfit.ts` — `demoAmazfitMetrics()`.
- Renders in: `src/components/amazfit-connection-card.tsx` (the AMAZFIT ·
  ZEPP NODE card, below the WHOOP card in the left rail).
- There is **no public Amazfit / Zepp OAuth API** for personal dashboards.
  Do not build an OAuth route: the honest connection is a **local import**.
  The card is a client component that reads the user's Zepp GDPR export
  (JSON or CSV), parses it with `parseAmazfitImport()`, and stores the
  result in `localStorage` under `AMAZFIT_STORAGE_KEY`. Demo data renders
  with a `DEMO` chip until an import is present (`IMPORTED` after).
- No env vars. A sample import lives at `public/amazfit-sample.json`.

## Key handling rules (explain these to the user)

- Keys belong in a local file named `.env.local` in the project root. That
  file is already covered by `.gitignore` and must never be committed.
- **Never paste an API key, token or secret into an AI chat** — not to you,
  not to any other assistant. If the user tries, stop them, explain why, and
  walk them through putting it in `.env.local` themselves.
- Secrets stay server-side: route handlers and server-only modules may read
  them; client components and the browser must never see them.

## Personalizing (optional, no keys needed)

- Progress photo: replace `public/you-progress.png` (portrait, roughly
  756×1340).
- Birth date for the age dial: edit the values at the top of
  `src/features/dashboard/age-progress.ts` (and the BORN caption in
  `src/components/age-orbit-globe.tsx`).
- Demo numbers: `src/features/dashboard/demo-social.ts` (social) and
  `src/features/dashboard/demo-whoop.ts` (vitals, weight, workouts).
