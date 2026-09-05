# Withings Body Scan - Body Composition tab integration

Status: **spec, not yet implemented**. Development track (branch + PR, Pawel merges).
Written 05/09/2026 from a live payload of Pawel's account.

## Requirement

Daily Withings Body Scan weigh-ins become the routine input to the Body Composition tab,
replacing the InBody printout photo as the day-to-day source. The monthly SATS InBody scan
stays exactly as it is (`scans[]`, Notion Scan Log, photo flow) as an independent cross-check.

The dashboard shows a complete trend of every complete weigh-in Withings holds, from a
chosen start date, regardless of how often the pull runs. The pull is "everything since the
last row I have", never "today's reading".

## Two instruments, two arrays, never one series

| | Withings Body Scan | SATS InBody |
|---|---|---|
| array | `weighins[]` (new) | `scans[]` (existing) |
| cadence | daily, home, morning | monthly, gym |
| method | BIA, 4-limb + trunk segmental | BIA, InBody 8-point |
| muscle figure | `muscle_mass_kg` = Withings composite | SMM (skeletal muscle mass) |
| provenance | API pull, verified | photo, hand-extracted |

The two muscle figures measure different things (69 kg vs a ~40 kg SMM is not a
discrepancy, it is a definition). Fat % differs by instrument too. **Never plot one on the
other's axis, never merge, never "calibrate" one to the other.** Where a chart shows both,
they are two labelled series with the InBody points visibly distinct (marker only, no line).

## Data source

Cloudflare Worker `withings-mcp` (Pawel's account) owns the Withings OAuth tokens and
refreshes them itself. It stores no readings. Source to be committed under
`infra/withings-mcp/` (Implementation, step 0).

- Base URL: `https://withings-mcp.paul-rucki.workers.dev`
- Auth: header `Authorization: Bearer $WITHINGS_TOKEN`
- `GET /status` - connection health; `refresh_token_days_left_est` < 30 means Pawel must
  re-run `/auth` in a browser (yearly chore; the preflight surfaces it).
- `GET /api/measures?start=YYYY-MM-DD&end=YYYY-MM-DD` - all measurement rows, newest first,
  one row per weigh-in (the Worker merges Withings' split groups on timestamp).
  `?days=N` is the alternative to `start`/`end`. Dates are Copenhagen-local.
- `GET /api/activity?...` - daily steps / distance / active minutes / calories / HR zones.
  Out of scope for this spec; available for a later Activity panel.
- `GET /api/sleep?...` - empty; no sleep device.

Environment requirement (same pattern as Hevy): the claude.ai/code environment must define
`WITHINGS_TOKEN` and allowlist `withings-mcp.paul-rucki.workers.dev`. That is a property of
the environment, not of this repo. `scripts/withings-preflight.sh` reports which of
token / egress / transient is the problem - never guess.

Withings returns `601 Same arguments in less than 10 seconds` on identical repeated calls.
Do not retry an identical request inside 10 s. Backfills longer than ~1 year: slice by year.

## Row shape (as returned by the Worker, verified 05/09/2026)

```json
{
  "datetime": "2026-09-05T06:35:43",
  "sources": ["Body Scan"],
  "algo": 218300672,
  "complete": true,
  "weight_kg": 89.193,
  "fat_pct": 18.589,
  "fat_mass_kg": 16.58,
  "fat_free_mass_kg": 72.61,
  "muscle_mass_kg": 69.11,
  "bone_mass_kg": 3.5,
  "hydration_kg": 49.32,
  "extracellular_water_kg": 18.17,
  "intracellular_water_kg": 31.15,
  "visceral_fat_index": 3.3,
  "basal_metabolic_rate_kcal": 2112,
  "metabolic_age_y": 40,
  "heart_rate_bpm": 105,
  "nerve_health_score": 44.075,
  "undocumented_158": 41.872,
  "undocumented_159": 44.935,
  "fat_free_mass_segments_kg": {"trunk": 37.69, "left_leg": 12.87, "right_leg": 13.0, "left_arm": 4.55, "right_arm": 4.5},
  "fat_mass_segments_kg":      {"trunk": 10.77, "left_leg": 2.41,  "right_leg": 2.11, "left_arm": 0.65, "right_arm": 0.64},
  "muscle_mass_segments_kg":   {"trunk": 36.07, "left_leg": 12.0,  "right_leg": 12.04,"left_arm": 4.51, "right_arm": 4.49}
}
```

Notes on fields:
- Segment left/right mapping confirmed against the Withings app on 05/09/2026
  (position 10 = left leg, 11 = right leg, 2 = left arm, 3 = right arm, 12 = trunk).
- `undocumented_158/159` are not in Withings' public type table; values sit next to the
  nerve-health score and are probably per-foot skin conductance in µS. **Store nowhere, do
  not chart, do not name.** Revisit if Withings documents them.
- `algo` is the composition algorithm version. It changed between 04/09 and 05/09/2026
  (218300416 -> 218300672). A step in any composition series that coincides with an `algo`
  change is the scale, not Pawel - see Rendering.
- `heart_rate_bpm` at weigh-in has been 102-105 on every reading so far, including at 04:04.
  Store it; do not interpret it as resting HR.
- `complete: false` = weight recorded but impedance failed (the 08:24 / 08:25 pair on
  03/09/2026 is the pattern: a failed attempt then a good one 77 s later). Drop these rows.

## `weighins[]` schema in `index.html`

One object per complete weigh-in, chronologically sorted. `dt` is ISO local
`YYYY-MM-DDTHH:MM:SS` (not `DD/MM/YYYY` - that is `scans[]`'s legacy format; do not copy it).

```json
{
  "dt": "2026-09-05T06:35:43",
  "algo": 218300672,
  "kg": 89.19, "fatPct": 18.59, "fatKg": 16.58, "ffmKg": 72.61, "muscleKg": 69.11,
  "boneKg": 3.50, "waterKg": 49.32, "ecwKg": 18.17, "icwKg": 31.15,
  "vfi": 3.3, "bmr": 2112, "metAge": 40, "hr": 105, "nhs": 44.1,
  "seg": {
    "ffm":    {"trunk": 37.69, "lLeg": 12.87, "rLeg": 13.00, "lArm": 4.55, "rArm": 4.50},
    "fat":    {"trunk": 10.77, "lLeg": 2.41,  "rLeg": 2.11,  "lArm": 0.65, "rArm": 0.64},
    "muscle": {"trunk": 36.07, "lLeg": 12.00, "rLeg": 12.04, "lArm": 4.51, "rArm": 4.49}
  },
  "note": null
}
```

- Round to 2 dp (kg, %), 1 dp for `nhs`, integers for `bmr`, `metAge`, `hr`.
- `undocumented_*` fields are **not** copied into `index.html` (public repo; unknown data).
- `note` is free text, same conventions as session notes (`**NOT trend-valid**` marker for
  travel/illness/known-dehydrated readings, correction annotations in `[...]`).
- Segments may be absent on some rows (03/09/2026 has none). `seg: null` then; renderers
  must tolerate it.

## Ingestion rule (data track - straight to `main`)

In any "update dashboard" session, after the Hevy fetch:

1. `last = max(weighins[].dt)`; if `weighins` is empty, use the backfill start date agreed
   with Pawel (Body Scan purchase date; ask if unknown - do not assume).
2. `GET /api/measures?start=<date(last)>&end=<today>`.
3. Drop `complete: false`. Drop rows with `datetime <= last` (dedup on `dt`, exact).
4. Map to the schema above; append; keep the array sorted.
5. Bump `TODAY` as usual. `node scripts/validate.js` + `node scripts/smoke.js`. Commit
   `Deploy YYYY-MM-DD HH:MM`, push `main`.

If the Worker is unreachable, say which preflight row applies (token / egress / transient)
and carry on with the rest of the session. **Never hand-type weigh-in numbers from the phone
app** - a missed pull is caught up by the next one; a typo is forever.

No Notion write per weigh-in. The repo is the record for daily readings; the Notion Scan
Log stays monthly/InBody only.

## Rendering (development track)

Body Composition tab gains a Withings block above the existing InBody block. Minimum:

- **Header KPIs** (latest complete weigh-in): weight, fat %, fat kg, muscle kg, water kg,
  visceral fat index, with delta vs 7-reading mean.
- **Trend charts**, x = date, raw points + rolling mean line over the last 7 readings
  (readings, not calendar days - gaps are gaps):
  1. weight
  2. fat % and fat kg
  3. muscle kg and fat-free mass kg
  4. water: total, ECW, ICW (ECW/ICW ratio is the hydration-noise tell)
  5. visceral fat index, metabolic age (small)
- **Segmental**: latest reading as a 5-box body outline or a simple table with L/R
  asymmetry % per limb. Asymmetry > 5 % gets a highlight - it is the one segmental number a
  training programme can act on.
- **Algorithm change marker**: a vertical dashed line on every chart where `algo` changes
  between consecutive rows, labelled with the new value. Rolling mean restarts at the marker.
- **InBody overlay**: on weight and fat % charts only, `scans[]` points as distinct markers,
  no connecting line, legend "InBody (SATS)". Nothing else from `scans[]` is overlaid.
- Existing InBody block (score, SMM, VFL, WHR, table) unchanged.

Validator additions (`scripts/validate.js`):
- `weighins[]` sorted ascending by `dt`, unique `dt`.
- `kg`, `fatPct`, `fatKg`, `ffmKg` present on every row; `fatKg + ffmKg ~ kg` (+/-0.1).
- When `seg` present: five keys per metric; segment sums ~ the whole-body figure (+/-0.2).
- `dt` in ISO local format `YYYY-MM-DDTHH:MM:SS`.

Smoke: the new charts must draw; add the Withings block to the click-through.

## Implementation checklist (one Claude Code session, development track)

0. `infra/withings-mcp/worker.js` - commit the Worker source Pawel provides, plus a
   `README.md` there stating: deployed via Cloudflare dashboard (not wrangler, not Workers
   Builds); secrets `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `MCP_TOKEN`; KV binding
   `TOKENS`; **secrets changed in the dashboard need a redeploy from Edit code to bind**
   (learned 05/09/2026); yearly `/auth`.
1. `scripts/withings-preflight.sh` and the second SessionStart hook in
   `.claude/settings.json` are already on this branch. Wire `npm run preflight` to run both.
   Apply the same `HTTPS_PROXY` unset-safe fix to `hevy-preflight.sh` (`set -u` trips on it
   outside the cloud environment).
2. `weighins[]` + renderers + validator + smoke per above. `EXERCISE_ORDER` untouched.
3. `CLAUDE.md`: add the section in Appendix A; add a row to "When to read which doc"
   pointing here; add `weighins[]` to Track 1's list; add the Withings step to the update
   workflow between steps 3 and 4.
4. `README.md` diagram and `workflows.html` - both, same session, per house rule.
5. Backfill: ask Pawel for the start date, pull, append. This is data track and lands on
   `main` after the PR merges, not inside the PR.

## Appendix A - CLAUDE.md section to add

```
## Withings weigh-ins (Body Composition tab, daily)

Source: Cloudflare Worker `withings-mcp` (spec: `docs/WITHINGS_SPEC.md`). Env var
`WITHINGS_TOKEN`; host `withings-mcp.paul-rucki.workers.dev` must be on the egress
allowlist. `scripts/withings-preflight.sh` runs at SessionStart; its verdict is in your
context - never call Withings "blocked" without it.

Every "update dashboard" session, after Hevy: fetch
`/api/measures?start=<last weighins[].dt date>&end=<today>`, drop `complete:false`, dedup on
`dt`, append to `weighins[]` (schema in the spec), keep sorted. Data track: straight to
`main` with the session's other data. No Notion write. Never hand-type a weigh-in from the
phone app.

`weighins[]` (Withings, daily, home) and `scans[]` (InBody, monthly, SATS) are different
instruments and stay separate series. `muscle_mass` is not SMM. Do not merge, calibrate or
compare them as if they were one.

`algo` changes between rows are scale-side model updates; the charts mark them. Do not
write a note interpreting a step that coincides with one.

Yearly: when preflight says the refresh token is < 30 days from expiry, tell Pawel to open
`https://withings-mcp.paul-rucki.workers.dev/auth` in a browser once.
```
