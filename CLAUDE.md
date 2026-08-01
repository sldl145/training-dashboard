# Training Dashboard — Update Contract

Single-file dashboard (`index.html`) for Pawel's training, body composition, and running data.
Live at: https://sldl145.github.io/training-dashboard/ (GitHub Pages, serves `main`).

This repo is updated **directly by Claude Code sessions** — there is no local working copy
anywhere else. Pushing `main` is publishing.

## The update workflow

When asked to "update the dashboard" (typically after a gym session):

1. **Read Notion decisions.** Go to the Gym Hub page → current month's Training Log →
   list its session child pages → collect **unchecked items in each `Decisions` section**.
   Those are the literal work orders. Also read `Flags` and `Context` for note-writing context.
2. **Fetch ground truth from Hevy** (see Hevy API below). Cross-check every number in the
   Decisions against the actual Hevy sets. **Hevy always wins** — the PT logs into Hevy;
   any verbal/PT number that contradicts Hevy sets gets the Hevy value plus a correction
   annotation (format below).
3. **Apply targeted edits to `index.html`.** Never regenerate the file or a whole data
   block wholesale — use surgical edits only. Bump the `TODAY` constant (the ONLY date
   constant to update; everything else derives from it).
4. **Validate:** `node scripts/validate.js` must exit 0 (warnings are OK, errors are not).
5. **Commit and push `main` directly** (no PRs, no side branches). Commit message
   convention: `Deploy YYYY-MM-DD HH:MM` with a body summarizing what changed.
6. **Check off the executed Decisions** in the Notion session pages.

This workflow assumes an interactive session (the Notion connector is not available in
headless/scheduled runs). If Hevy or Notion is unreachable, say so and fall back to data
pasted into the chat — do not guess numbers.

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
- Expected endpoints (verify against https://api.hevyapp.com/docs on first use and
  update this section with the confirmed shapes):
  - `GET /v1/workouts?page=1&pageSize=10` — newest workouts, paginated
  - `GET /v1/workouts/events?since=<ISO date>` — changes since a date
- If the key is missing or the API unreachable, ask for a pasted export instead.
- Note: `api.hevyapp.com` must be allowed in the Claude Code environment's network
  policy — as of 01/08/2026 it was blocked (curl returned no response). Until Pawel
  allowlists it (environment settings → network), use the pasted-export fallback.

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

### Other tabs
- `runs`: `avgPaceSec` must equal `durationSec / distance` (±2s). `elevation: null`
  currently doubles as the indoor marker — set it for outdoor runs when known.
- `scans` (InBody): date format `DD/MM/YYYY`; `vfl`/`whr` may be `null` (UI falls back
  to the last scan that has a reading).
- Goals cards (`renderGoals`) are hand-edited HTML — monthly cadence, archive the old
  month's card block rather than deleting (see `_JUNE_ARCHIVE` pattern).

## Verification

- `node scripts/validate.js` — data consistency + inline-script syntax. Must pass.
- After pushing, the live page updates within ~a minute:
  https://sldl145.github.io/training-dashboard/ — spot-check the tab you touched.

## History / provenance

- Until Aug 2026 this repo was updated by Cowork on a local machine and pushed manually;
  the Gym Hub page in Notion documents the system. Session journals remain in Notion —
  this repo is the rendered dashboard, Notion is the narrative record.
