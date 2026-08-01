# Running Tab - Design Specification

Status: LIVE since 22/03/2026. Ported from the Cowork project 01/08/2026 - data now
flows through a single Claude Code session instead of Chat + Cowork.

---

## Overview

The third tab ("Running") in `index.html` tracks running data for a half marathon on
**20/09/2026**. Data source: Apple Fitness screenshots pasted into the session (and/or
run entries already written to the Notion Running Log). The session extracts the
numbers, writes the Notion entry (dedup on date), and appends to `runs[]`.

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
(distance-focused), interval (speed work), race.

## Layout (top to bottom)

1. **Countdown hero** - weeks to race day + progress bar (from `TODAY` / `RACE_DATE`).
2. **Readiness panel** - composite 0-100 score: long run 40%, weekly volume 25%,
   pace 20%, frequency 15%, each vs the reference plan's target for the current week.
   Confidence label from run count. Gap analysis: which actions add the most points.
   (Pace scores 0 with a "No runs in last 4 weeks" label when the window is empty -
   fixed 01/08/2026, previously it fabricated a pace.)
3. **Alerts** - red/yellow/green cards vs plan (training deficit, volume below plan,
   long run attention, pace signal).
4. **Next week's targets** - phase, runs, volume, longest run, easy pace band
   (easy pace = race-pace midpoint + 60-90 s/km).
5. **KPI cards** - total runs, total distance, avg pace (4w), longest run,
   weekly avg (4w), avg HR (4w).
6. **Goals** - fully computed, no manual edits: longest-run milestones
   (10/15/18/21.1 km, DONE + date from actual runs), weekly volume, frequency,
   race pace band.
7. **Charts** - weekly volume (bar), pace trend (line, y-axis inverted so faster
   reads higher, points color-coded by type), long run progression, HR vs pace
   scatter (easy runs only - aerobic efficiency), progress vs plan.
8. **Data table** - all runs, reverse chronological.

## Reference training plan

`getTrainingPlan()` generates a week-by-week curve **anchored to the real race date**:
length = weeks from `TRAINING_START` to `RACE_DATE` (auto-recalculates if either
changes). Phases counted backwards from race day: race week, 4-week taper, 8-week
peak, 8-week build, base building fills the remainder. Readiness, alerts, weekly
suggestion, and the Progress-vs-Plan chart all read from this curve.

To change ambition, change `TARGET_FINISH_MIN` / `TARGET_FINISH_MAX` (minutes,
currently 120/130 -> ~5:41-6:10 /km race band) - everything downstream follows.

## Notion Running Log

Cumulative page (not monthly): `32bb42b1-9c89-8139-b344-c60aea4ce195`, child of the
Gym Hub. Entry format is defined in `docs/DEBRIEF.md`. Cumulative because a half
marathon build is one continuous arc - revisit if it outgrows ~50 entries.

## Open items

- [ ] Confirm which half marathon event on 20/09/2026
- [ ] Gym/running interaction - should certain gym days avoid running within 24h?
