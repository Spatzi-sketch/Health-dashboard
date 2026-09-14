# ROWZY Health Dashboard

The ROWZY dashboard — a dark, cinematic personal health + social-metrics
command centre — from the Wise Twins, extended with an **Amazfit / Zepp
connection**.

This is the actual frontend we run every day: the WHOOP vitals rail, the
orbital age chronometer, the social signal core, the analytics hub, the
progress detail, the mission deck. Same styles, same animations, same
components. Out of the box every number is generated demo data, so it runs
on any machine with nothing but Node installed.

- No login. No environment variables. No network calls.
- One person panel — **YOU** — instead of our two.
- Clap twice to toggle Clap Mode. Scroll firmly upward past the top for
  the Mission Deck.
- Self-hosted fonts (via `@fontsource`), so the build works fully offline —
  no runtime call to Google Fonts.

## Connect your Amazfit watch

Amazfit / Zepp does **not** offer a public OAuth API for personal
dashboards, so the honest connection path is a **local data import**:

1. In the Zepp app: **Profile → Security & Privacy → User Rights → Export
   Data**. You receive your data archive by email.
2. In the dashboard, open the **AMAZFIT · ZEPP NODE** card (below the WHOOP
   card) and press **Connect Amazfit**.
3. Drop in your exported **JSON or CSV** (or paste its contents), or press
   **Load sample** to see the format.

Imported data is parsed and stored in your browser's `localStorage` — it
never leaves your device. The card shows a `DEMO` chip until you import, and
`IMPORTED` once your own data is loaded. See
`src/features/dashboard/amazfit.ts` for the types and parser, and
`public/amazfit-sample.json` for an example file you can open in a text
editor to match your export against.

## Run it

Needs Node 20 or newer — check with `node --version`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Make it yours

- Swap `public/you-progress.png` for your own progress photo.
- Set your birth date in `src/features/dashboard/age-progress.ts` so the
  orbit dial counts your own year.
- The demo numbers live in `src/features/dashboard/demo-social.ts`,
  `src/features/dashboard/demo-whoop.ts` and
  `src/features/dashboard/amazfit.ts`.

Future versions can connect other real data — see `SETUP-AGENT.md` for the
reserved configuration names.

MIT licensed. Built by the Wise Twins ([ohwisey](https://github.com/ohwisey)).
