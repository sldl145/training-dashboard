# Gym Dashboard - Full Operating Instructions

Complete operating manual for maintaining and updating Pawel's training dashboard.
Any Claude Code session on this repo can continue the work. Ported from the Cowork
"Exercise Tracker" project on 01/08/2026; the Mac/Cowork deploy pipeline is retired -
this repo IS the system now (see `docs/DEPLOYMENT.md`).

---

## Repo Structure

```
training-dashboard/
  index.html                      <- THE DASHBOARD (Training + Body Composition + Running tabs)
  CLAUDE.md                       <- Routing layer + workflow contract for sessions
  README.md                       <- System architecture diagram (keep current on workflow changes)
  assets/
    chart.umd.min.js              <- Chart.js 4.4.1, vendored (page loads no external scripts)
    html2pdf.bundle.min.js        <- html2pdf 0.10.1, vendored
  scripts/
    validate.js                   <- Data consistency + syntax check - must exit 0 before push
    smoke.js                      <- Real-browser render check - must pass before push
  docs/
    GYM_DASHBOARD_INSTRUCTIONS.md <- THIS FILE
    DEBRIEF.md                    <- Post-session debrief conversation + Notion journal formats
    RUNNING_TAB_SPEC.md           <- Running tab design specification
    DEPLOYMENT.md                 <- Hosting (GitHub Pages) + publishing details
```

Historical archives (monthly trackers Nov 2025 - Feb 2026, Hevy JSON backups, InBody
scan images) stayed with Pawel when the Cowork project was retired. Scan images now
attach to their Notion Scan Log rows; they are never committed to this public repo.

---

## Data Source: Hevy API

The primary lifting data source is the Hevy workout tracking app.

- REST API, base `https://api.hevyapp.com`, header `api-key: $HEVY_API_KEY`
  (see CLAUDE.md - key + network allowlist may still be pending; until then ask
  Pawel to paste the workout and parse that instead).
- Equivalent of the old MCP calls: `GET /v1/workouts?page=1&pageSize=10` (newest
  first, max pageSize 10); a workout-count endpoint can detect new sessions.

### Hevy-to-Dashboard Exercise Name Mapping

| Hevy Name | Dashboard Name |
|-----------|---------------|
| Overhead Press (Barbell) | Overhead Press |
| Pull Up (Weighted) | Weighted Pull-ups |
| Seated Row (Machine) | Seated Row |
| Straight Leg Deadlift | SLDL (GRAVEYARD) |
| Bench Press (Barbell) | Bench Press |
| Squat (Barbell) | Barbell Squat |
| Preacher Curl (Barbell) | Preacher Curl |
| Seated Triceps Press | Triceps Extension |
| Triceps Extension (Cable) | Triceps Extension |
| Lying Leg Curl (Machine) | Lying Leg Curl |
| Hack Squat (Machine) | Hack Squat |
| Leg Press (Machine) | Leg Press |
| Triceps Dip (Weighted) | Weighted Dips |
| Lat Pulldown (Cable) | Lat Pulldown |
| Romanian Deadlift (Barbell) | Romanian Deadlift |
| Single Arm Triceps Pushdown (Cable) | Single Arm Triceps Pushdown |
| Leg Extension (Machine) | Leg Extension |
| Reverse Curl (Cable) | Reverse Curl |
| Hammer Curl (Dumbbell) | Hammer Curl (GRAVEYARD) |
| Iso-Lateral Row (Machine) | Iso-Lateral Row (GRAVEYARD) |
| Chin Up (Weighted) | Chin-ups (GRAVEYARD) |
| Pull Up (Band) | Weighted Pull-ups / Band-Assisted Pull-ups (see below) |
| Chest Fly (Machine) | Chest Fly (GRAVEYARD) |
| Seated Chest Flys (Cable) | Chest Fly (GRAVEYARD) |
| Back Extension (Weighted Hyperextension) | Back Extension (GRAVEYARD) |
| Chest Dip (Assisted) | Chest Dip (Assisted) (GRAVEYARD) |
| Chest Press (Machine) | Chest Press (Machine) (GRAVEYARD) |
| Bicep Curl (Cable) | Bicep Curl (Cable) (GRAVEYARD) |
| Seated Shoulder Press (Machine) | Seated Shoulder Press (GRAVEYARD) |
| T Bar Row | T Bar Row (GRAVEYARD - pending classification, promote on 2nd appearance) |

Note: "Seated Triceps Press" and "Triceps Extension (Cable)" are the same exercise,
different Hevy template IDs. Map both to "Triceps Extension".

**If a Hevy exercise name is not in this table, do NOT skip it.** Flag it to Pawel and
agree a mapping (or a new dashboard/graveyard entry) before continuing. Silently
dropping unmapped names is how the 2025 history went missing - found and fixed 13/07/2026.

Deliberately not tracked (single-session one-offs, decision 13/07/2026): Bench Press
(Dumbbell), Dumbbell Row, Incline Bench Press (Dumbbell), Lateral Raise (Dumbbell),
Pull Up (Assisted), Seated Leg Curl (Machine), Shoulder Press (Dumbbell).

### Assistance-Load Exercises (inverted scale)

Two series record **assistance**, not added load, so **lower is stronger** and the chart
reads downwards:

- **Band-Assisted Pull-ups** (graveyard) - weight = band assistance in kg.
- **Chest Dip (Assisted)** (graveyard) - weight = machine assistance in kg.

Hevy's `Pull Up (Band)` sessions split across two series:
- If the session contains any unassisted (0 kg) set -> the data point goes to
  **Weighted Pull-ups** as `weight: 0, bestReps: <best reps at 0 kg>` (unit "kg added").
- If every set was band-assisted -> the data point goes to **Band-Assisted Pull-ups**
  as `weight: <lightest band used>, bestReps: <best reps at that band>`.

### Data Extraction Rules

For each exercise in a session, extract ONE data point:

1. Pick the set with the **heaviest weight** used in that session.
2. Record the **best reps achieved at that weight** (not across all sets).
3. If the heaviest weight was only touched for 1 rep but there's a meaningfully better
   e1RM at a lower weight, still pick the heaviest weight.

Example: Bench Press 75 x 4, 75 x 4, 70 x 8 -> `{ weight: 75, bestReps: 4 }`.

Exception: the very first Bench Press session (11/02/2026) has TWO entries (75 x 1 and
60 x 5) documenting both the initial test and the deload decision. One-off - never repeat.

### PT-Logged Entries

A small number of data points exist with **no Hevy record** (Overhead Press, Seated Row,
Hack Squat, Weighted Dips, Preacher Curl on assorted Nov 2025 / Apr 2026 dates) - they
came from the PT's own log and are flagged in their `note` with `[PT-logged - no Hevy
record...]`. Do not delete them as "orphans" during reconciliation, and do not expect
them to match Hevy.

### Judgement-Call Entries

A handful of data points deliberately use a working set rather than the heaviest set
(e.g. OHP 23/02/2026 kept at 45 x 5 despite a 50 x 2 top single). These are allowlisted
in `scripts/validate.js` (`DELOAD_EXCEPTIONS`) and produce warnings, not errors. Only
"correct" an existing entry when its weight x reps pair does **not** appear in any logged
Hevy set for that session - that indicates a transcription error, not a judgement call.
(Four such transcription errors from Nov 2025 were found and corrected on 01/08/2026 -
see the correction annotations in their notes and the git history.)

### Preacher Curl Weight Note

Hevy sometimes shows 37 kg for what is actually 37.5 kg (barbell increments are 2.5 kg).
Use 37.5 if Hevy shows 37.

---

## Dashboard Architecture

Single self-contained HTML file (`index.html`):

- **Chart.js 4.4.1** - vendored at `assets/chart.umd.min.js` (switched from CDN
  01/08/2026 so the page has zero runtime dependencies on external hosts).
- **Vanilla JavaScript**, no framework. **CSS custom properties** for theming.
- **Tabs:** Training, Body Composition, Running (see `docs/RUNNING_TAB_SPEC.md`).

### HTML Structure

```
<div class="tab-nav">  <- Tab buttons: Training | Body Composition | Running

[Training Tab]
<div id="summary">     <- Summary stat cards (auto-calculated)
<div id="goals">       <- Monthly goal cards (manually maintained)
<div id="sections">    <- Exercise charts
<div id="tables">      <- Collapsible exercise tables with expandable set detail rows
<div id="graveyard-section">  <- Collapsible retired exercises
<div id="injury-log-section"> <- Collapsible injury history, grouped by muscle group

[Running Tab]
<div id="running-countdown"> ... <div id="running-table">  (see RUNNING_TAB_SPEC.md)
```

### JavaScript Structure

```javascript
const exercises = { ... }   // Active exercise data (Training tab)
const graveyard = { ... }   // Retired exercise data (preserved, not charted)
const injuryLog = [ ... ]   // Injury history
const runs = [ ... ]        // Running data
// const scans = [ ... ]    // InBody data - lives INSIDE initInBodyCharts(), not top level

// THE ONLY constant to update each session:
const TODAY = "YYYY-MM-DD"
// Derived automatically - never edit: SEVEN_DAYS_AGO, fourWeeksAgo (isNew), subtitle, time span
// Fixed race constants:
const RACE_DATE = "2026-09-20"
const TRAINING_START = "2026-01-11"
const TARGET_FINISH_MIN/MAX = 120/130  // finish-time goal (min); pace bands derive from these
```

Rendering is fully automatic from the data arrays except `renderGoals()` (hand-written
monthly HTML) and `EXERCISE_ORDER` (chart order; lifts absent from it get a NEW badge).

### Exercise Data Format

```javascript
"Exercise Name": {
  muscle: "Chest / Triceps",
  unit: "kg",                  // or "kg added" (weighted bodyweight), "kg assist" (inverted)
  type: "compound",            // or "isolation"
  data: [
    { date: "YYYY-MM-DD", weight: 75, bestReps: 6, note: "...",
      sets: [{"w":75,"r":4},{"w":75,"r":4},{"w":70,"r":8}] },
    // chronological; sets = all working sets in order performed
    // weight/bestReps follow the extraction rule (heaviest weight, best reps at it)
    // a few legacy Nov 2025 rows lack sets - never add new rows without sets
  ]
}
```

Graveyard exercises add: `reason: "why retired"`, `lastSession: "DD/MM/YYYY"`.

### Injury Log Format

```javascript
{
  name: "Injury name (Grade)",
  muscleGroup: "Posterior Chain",       // grouping header
  onset: "YYYY-MM-DD", resolved: "YYYY-MM-DD" | null,
  status: "recovered" | "rehab" | "active",
  cause: "...", affected: ["Exercise (what changed)"],
  timeline: [ { date: "DD/MM", note: "..." } ],
  recoveryDays: number | null,
  lesson: "One-liner takeaway"
}
```

Add a new injury when one is documented in a session debrief; update `status`,
`resolved`, `recoveryDays`, and timeline entries as recovery progresses.

### Charts / Badges

Per-exercise chart: Weight (solid, colored, filled) + Est. 1RM (dashed grey,
`weight * 36/(37-reps)`) + Best Reps (light grey, right axis 0-12).
- **Current PR** badge: latest e1RM equals all-time best (±0.5 kg).
- **NEW** badge: exercise not in `EXERCISE_ORDER` - add it there once established.
- **Injured** badge: currently hardcoded off (`hasInjury = false`).

---

## What to Update Each Session

See CLAUDE.md for the full single-session workflow (debrief -> Notion -> data -> checks
-> push). The dashboard-side mechanics:

1. **Get the workout** (Hevy API or pasted export). Compare dates with existing data
   to identify new sessions.
2. For each exercise: map the name (table above), extract the data point + all sets,
   append chronologically with a meaningful note (PR, target hit, technique, RPE).
3. Update `TODAY` - the only date constant to edit.
4. Update `renderGoals()` if targets were hit (status -> `&#10003; DONE` /
   `&#10003; EXCEEDED`, update the counter in the section label).
5. Run both checks: `node scripts/validate.js` and `node scripts/smoke.js`.
6. Commit + push `main` (see `docs/DEPLOYMENT.md`).

---

## Monthly Goal Management

### Setting Goals (start of month)
Agreed with Pawel: Body Composition (PBF/SMM targets), Primary lifts (~4, weight x reps),
Secondary lifts (2-3), Nice-to-have (tracked, no formal target), Cardio (running plan).

### Updating Goals
`renderGoals()` is hand-written HTML - replace its content when goals change. Status
colors: green + `&#10003;` = achieved, orange = in progress, muted = not started.
Archive the old month's block as a `_MONTH_ARCHIVE` template string rather than deleting.

---

## Graveyard Rules

**If an exercise has no data for 2 consecutive weeks, ASK Pawel whether to keep or
drop it. Never auto-remove.** (Explicit PT/Pawel decisions bypass the ask.)

To retire: cut from `exercises`, paste into `graveyard` with `reason` + `lastSession`,
mark as Paused/removed in goals if applicable.

New movement seen once -> graveyard with a reason (precedents: Single Leg Extensions
#117, T Bar Row #119); promote to `exercises` on second occurrence.

---

## InBody Scans (Body Composition tab)

Notion Scan Log: page `b3212cc0-f266-4059-bf8d-098ac2369ebc`, data source
`ea0a85b3-a860-45b9-af4e-212d76773a19`. Properties: Scan Date (title, DD/MM/YYYY),
Date, Score, Weight (kg), SMM (kg), BFM (kg), PBF (%), BMI, VFL, WHR.

- Pawel pastes the scan photo into the session.
- Extract all metrics (VFL/WHR may be missing -> `null`; the UI falls back to the
  last scan that has a reading).
- **ASK Pawel what he wants done** before proceeding (update dashboard now, just log
  to Notion, skip, or discuss the numbers first).
- Apply the Notion Dedup Rule (match on Scan Date) before writing the row.
- **Attach the scan image to the Notion row** - images live in Notion, never in
  this public repo.
- Append to `scans[]` (inside `initInBodyCharts()`); everything renders from it.
- Update body-comp goals in `renderGoals()` if affected.

---

## End-of-Month Checklist

1. Confirm all goal statuses with Pawel.
2. Agree new month's goals (body comp + primary + secondary + nice-to-have + cardio).
3. Update `renderGoals()` with new targets; archive the old month's block.
4. Check all exercises against the 2-week inactivity rule.
(The subtitle/time-span update themselves from TODAY - no manual step.)

---

Active exercises, current goals, injury status, and body composition are live state.
Read them from `index.html` (`exercises`, `renderGoals()`, `injuryLog`) and Notion
(InBody Scan Log; Gym Hub -> current month's Training Log for context and decisions).
Do not hardcode snapshots of live state in instruction files.
