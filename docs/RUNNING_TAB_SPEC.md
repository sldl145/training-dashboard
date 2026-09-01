# Running Tab - Design Specification

Status: LIVE since 22/03/2026. Ported from the Cowork project 01/08/2026 - data now
flows through a single Claude Code session instead of Chat + Cowork.

**Race machinery removed 01/09/2026** (Pawel's call). The 20/09/2026 half marathon was
cancelled and the tab is now a running log with no target event. See "History" below
before reinstating any of it.

---

## Overview

The third tab ("Running") in `index.html` logs runs. There is no race, no plan and no
countdown. Data source: Apple Fitness screenshots pasted into the session (and/or run
entries already written to the Notion Running Log). The session extracts the numbers,
writes the Notion entry (dedup on date), and appends to `runs[]`.

## Data model

One entry per run:

```javascript
{
  date: "2026-03-22",
  distance: 5.23,         // km, 2 decimals
  durationSec: 1695,      // total seconds (displayed as HH:MM:SS / MM:SS)
  avgPaceSec: 324,        // seconds per km (displayed as M:SS /km); MUST equal durationSec/distance ±2s (validator enforces)
  avgHR: 152,             // bpm or null
  maxHR: 171,             // bpm or null
  elevation: 34,          // metres or null - null currently doubles as the indoor marker
  calories: 312,          // kcal or null
  type: "easy",           // easy | tempo | long | interval | race
  notes: "First tracked run."
}
```

Run types: easy (conversational/recovery), tempo (comfortably hard), long
(distance-focused), interval (speed work), race. `type` is kept even with no race on
the calendar - it drives the point colouring on the pace and HR charts, and a race
entry stays valid if Pawel enters an event.

## Layout (top to bottom)

1. **KPI cards** - total runs, total distance, avg pace (4w), longest run,
   weekly avg (4w), avg HR (4w).
2. **Charts** - weekly volume (bar), pace trend (line, y-axis inverted so faster reads
   higher, points coloured by type), long run progression (axis derived from the data),
   HR vs pace scatter (all runs with HR, coloured by type).
3. **Data table** - all runs, reverse chronological.

Everything on the tab is computed from `runs[]`. There is nothing to hand-edit.

## Adding a run

Data track - straight to `main`, no PR. Append to `runs[]`, write the Notion entry
(dedup on date first), bump `TODAY`. The validator enforces
`avgPaceSec = durationSec / distance` (±2s) and chronological order.

## Notion Running Log

Cumulative page (not monthly): `32bb42b1-9c89-8139-b344-c60aea4ce195`, child of the
Gym Hub. Entry format is defined in `docs/DEBRIEF.md`. Cumulative because the whole
running record is one arc - revisit if it outgrows ~50 entries.

## History: what was removed, and what it would take to bring back

Removed on 01/09/2026: `RACE_DATE`, `TRAINING_START`, `TARGET_FINISH_MIN`/`MAX`,
`getRacePaceBand()`, `getEasyPaceBand()`, `getTotalPlanWeeks()`, `getTrainingPlan()`,
`getCurrentWeek()`, `getWeeksToRace()`, `calculateReadiness()`, `calculateGaps()`,
`renderRunningCountdown()`, `renderRunningReadiness()`, `renderRunningAlerts()`,
`renderWeeklySuggestion()`, `renderRunningGoals()`, and the Progress-vs-Plan chart.
Their containers came out of the tab markup and `scripts/smoke.js` dropped its Running
canvas floor from 5 to 4.

**This was option B of two put to Pawel.** Option A kept the machinery dormant behind a
"no race scheduled" state; he chose the clean strip. If a race is entered later, the
code is recoverable in full from git history - the commit that removed it is the one
carrying this file's rewrite. Prefer recovering it over rewriting from scratch, and
re-anchor `TRAINING_START` to the actual start of the new build rather than 11/01/2026.

Two things that were **not** removed and are worth keeping in mind: the run `type`
field, and the weekly-volume flagging convention in `docs/DEBRIEF.md` (>10% increase
yellow, >20% red), which is general endurance guidance rather than race preparation.

## Open items

- [ ] Gym/running interaction - should certain gym days avoid running within 24h?
- [ ] **Cardiac screening.** Recommended in the Notion Running Log on 05/02, 08/03 and
      22/03/2026 and still unactioned. The 28/08/2026 run recorded 196 avg / 204 max,
      the highest in the record and 16 bpm above Pawel's own established high baseline
      at a pace he had previously run at 180. Tracked here because it is the running
      record that carries the evidence; it is not a training item and nobody in this
      repo is qualified to assess it.
