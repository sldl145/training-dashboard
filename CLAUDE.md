# Training Dashboard — Update Contract

Single-file dashboard (`index.html`) for Pawel's training, body composition, and running data.
Live at: https://sldl145.github.io/training-dashboard/ (GitHub Pages, serves `main`).

This repo is updated **directly by Claude Code sessions** — there is no local working copy
anywhere else. Pushing `main` is publishing.

## When to read which doc

| Trigger | Read first |
|---------|-----------|
| "update dashboard" after a gym session | This file (workflow below) + `docs/DEBRIEF.md` for the debrief |
| Detailed data rules, Hevy name mapping, goals/graveyard mechanics | `docs/GYM_DASHBOARD_INSTRUCTIONS.md` |
| New run data / Running tab changes | `docs/RUNNING_TAB_SPEC.md` |
| New InBody scan | `docs/GYM_DASHBOARD_INSTRUCTIONS.md` (InBody section) |
| Publishing questions, live-site issues | `docs/DEPLOYMENT.md` |
| Monthly rollover | `docs/GYM_DASHBOARD_INSTRUCTIONS.md` (End-of-Month Checklist) |
| How the whole system fits together | `README.md` (diagram) |
| Pawel asks "how do I update X" | `workflows.html` (visual guide, live at /workflows.html on Pages) |

Any workflow change must update BOTH the README diagram and `workflows.html` in the
same session — they are the system's self-description.

## The update workflow (single session, post-gym)

When Pawel opens a session after training ("update dashboard", "gym session done", etc.),
one conversation does the whole pipeline — debrief, Notion journal, dashboard, publish:

1. **Debrief.** Ask the post-session questions (how it went, what the PT said, any pain
   signals, anything unusual) — conversation guide and journal formats in
   `docs/DEBRIEF.md`. Write the **Notion session page** as a child of
   the current month's Training Log: title `Session #NNN - DD/MM/YYYY` (next number in
   sequence), sections Journal / Flags / Decisions / Context. Journal is written in
   Pawel's voice from what he shared. Decisions are the literal dashboard work orders.
   **Notion Dedup Rule applies** (below).
2. **Collect decisions.** The ones just written, plus any still-unchecked Decisions on
   earlier session pages (e.g. from a Chat-side debrief — Chat remains a valid fallback).
3. **Fetch ground truth from Hevy** (see Hevy API below). Cross-check every number
   against the actual Hevy sets. **Hevy always wins** — the PT logs into Hevy; any
   verbal/PT number that contradicts Hevy sets gets the Hevy value plus a correction
   annotation (format below).
4. **Apply targeted edits to `index.html`.** Never regenerate the file or a whole data
   block wholesale — use surgical edits only. Bump the `TODAY` constant (the ONLY date
   constant to update; everything else derives from it).
5. **Validate:** `node scripts/validate.js` AND `node scripts/smoke.js` must both pass
   (validate: warnings OK, errors are not; smoke: real-browser render check).
6. **Commit and push `main` directly** (no PRs, no side branches). Commit message
   convention: `Deploy YYYY-MM-DD HH:MM` with a body summarizing what changed.
7. **Check off the executed Decisions** in the Notion session pages (on the same page
   where each was found).

This workflow assumes an interactive session (the Notion connector is not available in
headless/scheduled runs). If Hevy or Notion is unreachable, say so and fall back to data
pasted into the chat — do not guess numbers.

## House rules

- **Notion Dedup Rule.** Before ANY Notion write (session page, Running Log entry,
  Scan Log row), check for an existing entry keyed on the date. Identical → skip.
  Different values → flag to Pawel, do not overwrite. Never silently duplicate or clobber.
- **2-week inactivity rule.** If an exercise has no data for 2 consecutive weeks, never
  remove it on your own — ask Pawel first. Exception: an explicit PT/Pawel decision
  (recorded in a session page) bypasses the ask.
- **Preacher curl quirk.** Hevy shows 37 kg for what is physically 37.5 kg — always log 37.5.
- **Bench 11/02/2026 dual entry** (two rows, same date) is a confirmed one-off historical
  artifact — do not "fix" it, and do not repeat the pattern.
- **Push via git CLI only.** Never move `index.html` content through MCP file-push tools —
  large files get silently truncated in transit.

## Running data (Running tab)

Runs arrive two ways, dedup on date across both:
- **Apple Fitness screenshots** pasted into the session → extract date, distance, duration,
  avg/max HR, calories, type → append to the `runs` array AND write the Notion Running Log
  entry (dedup first).
- **Notion Running Log entries** already written by Chat → pull any not yet in `runs`.
The validator enforces `avgPaceSec = durationSec / distance` (±2s). `elevation: null`
doubles as the indoor marker — set it for outdoor runs when known.

## InBody scans (Body Composition tab)

Scan photo pasted into the session →
1. Extract: Scan Date, Score, Weight, SMM, BFM, PBF, BMI, VFL, WHR (VFL/WHR may be absent → `null`).
2. Write the Notion Scan Log row (**dedup on Scan Date**; properties listed in Notion IDs below).
3. **Attach the scan image to that Notion row** — images live in Notion, NEVER in this
   public repo.
4. Append to `scans[]` in `index.html` (date format `DD/MM/YYYY`). Header, hero, KPIs,
   charts, and table all derive from the array.

## Notion page IDs

- Gym Hub (index of everything): `349b42b1-9c89-81f6-9a18-c723b2273f98`
- Running Log (cumulative page): `32bb42b1-9c89-8139-b344-c60aea4ce195`
- InBody Scan Log: page `b3212cc0-f266-4059-bf8d-098ac2369ebc`,
  data source `ea0a85b3-a860-45b9-af4e-212d76773a19`
- Session pages are children of the current month's Training Log, titled
  `Session #XX - DD/MM/YYYY`, with sections Journal / Flags / Decisions / Context.

## Hevy API

- Env var `HEVY_API_KEY` is set in the Claude Code environment (Hevy Pro key from
  hevy.com → Settings → Developer).
- Base URL `https://api.hevyapp.com`, auth header `api-key: $HEVY_API_KEY`.
- Confirmed endpoints (verified live 01/08/2026):
  - `GET /v1/workouts?page=1&pageSize=10` — newest first, paginated. Returns
    `{page, page_count, workouts: [...]}`. Each workout: `id`, `title`,
    `start_time`/`end_time` (ISO 8601), `exercises[]` with `title`,
    `exercise_template_id`, and `sets[]` of `{index, type, weight_kg, reps, rpe, ...}`.
  - `GET /v1/workouts/events?since=<ISO datetime>&page=1&pageSize=10` — changes since
    a date. Returns `{page, page_count, events: [{type: "updated"|..., workout: {...}}]}`.
  - `GET /v1/workouts/count` — returns `{workout_count}`.
- If the key is missing or the API unreachable, ask for a pasted export instead.
- Network policy: `api.hevyapp.com` was initially blocked, but as of 01/08/2026 the
  allowlist is in place and the connection is confirmed working (HTTP 200 with the
  session key). If it ever fails again, check the environment's network policy before
  falling back to pasted exports.

## Data conventions (the important part)

### Heaviest-weight rule
A session row's `weight` = the heaviest set of that session; `bestReps` = the best reps
**at that weight**. This holds even when a lighter set had a better e1RM (e.g. 85×1 single
logged over 82.5×4). Exception: a deliberate deload can be logged at the working weight
with the heavier single still in `sets` — only when the session note explicitly says so
(precedents: Bench 11/02/2026, OHP 23/02/2026 & 11/03/2026).

### Row schema (exercises & graveyard)
```json
{"date":"YYYY-MM-DD","weight":80,"bestReps":5,"note":"...","sets":[{"w":80,"r":5},{"w":75,"r":6}]}
```
- `data` arrays are chronologically sorted; every row should have `sets` (a few legacy
  PT-only rows don't — never add new ones without).
- The summary MUST match a real set (validator enforces this).

### Notes style
- Narrative, information-dense; session number as `Session #NNN`; RPE where known.
- `**bold**` for PRs and headline findings.
- `**NOT trend-valid**` marker for readings contaminated by travel/illness/post-fail
  fatigue — plotted but excluded from trend interpretation.
- Corrections: never silently rewrite history. Append
  `[Corrected DD/MM/YYYY from Hevy sets: was X x Y - value not found in any logged set. Heaviest-weight rule applied.]`

### Exercise lifecycle
- New movement appears once → **graveyard** with a `reason`, not the main charts
  (precedent: Single Leg Extensions #117, T Bar Row #119). Promote on second occurrence.
- Retired movements move from `exercises` to `graveyard` with `reason` + `lastSession`.
- `EXERCISE_ORDER` (in the script) controls chart order; lifts absent from it get a NEW
  badge. When a lift stops being new, add it to `EXERCISE_ORDER`.

### Goals cards
- Goals cards (`renderGoals`) are hand-edited HTML — monthly cadence, archive the old
  month's card block rather than deleting (see `_JUNE_ARCHIVE` pattern). Update statuses
  when targets are hit. (Run/scan data conventions: see their sections above.)

## Verification

- `node scripts/validate.js` — data consistency + inline-script syntax. Must pass (exit 0).
- `node scripts/smoke.js` — renders the page in headless Chromium, clicks all three tabs,
  fails on any console/page error or undrawn chart. Must pass. (First run in a fresh
  container: `npm install` to get playwright-core; browsers are pre-installed at
  `/opt/pw-browsers` — never run `playwright install`.)
- Goals cards, `EXERCISE_ORDER`, and other hand-edited HTML: eyeball the rendered page.
- After pushing, the live page updates within ~a minute:
  https://sldl145.github.io/training-dashboard/ — spot-check the tab you touched.

## History / provenance

- Until Aug 2026 this repo was updated by Cowork on a local machine and pushed manually;
  the Gym Hub page in Notion documents the system. Session journals remain in Notion —
  this repo is the rendered dashboard, Notion is the narrative record.
