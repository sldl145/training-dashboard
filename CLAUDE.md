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
| Monthly rollover / first session of a new month | `docs/GYM_DASHBOARD_INSTRUCTIONS.md` (End-of-Month Checklist) |
| Setting goals for a new month | `docs/GYM_DASHBOARD_INSTRUCTIONS.md` (Goal Calibration) |
| How the whole system fits together | `README.md` (diagram) |
| Pawel asks "how do I update X" | `workflows.html` (visual guide, live at /workflows.html on Pages) |

Any workflow change must update BOTH the README diagram and `workflows.html` in the
same session — they are the system's self-description.

## The update workflow (single session, post-gym)

When Pawel opens a session after training ("update dashboard", "gym session done", etc.),
one conversation does the whole pipeline — debrief, Notion journal, dashboard, publish:

1. **Debrief.** Ask the post-session questions (how it went, what the PT said, any pain
   signals, anything unusual) — conversation guide and journal formats in
   `docs/DEBRIEF.md`. **One question per message, always.** Never a numbered list of
   questions, never two bundled into one message. Wait for the answer before asking the
   next. Standing instruction from Pawel (22/08/2026); having to restate it every session
   is the most common friction in this flow. Write the **Notion session page** as a child of
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
6. **Commit and push `main` directly** — this is a data update, see Two-track publishing
   below. Commit message convention: `Deploy YYYY-MM-DD HH:MM` with a body summarizing
   what changed.
7. **Check off the executed Decisions** in the Notion session pages (on the same page
   where each was found).

This workflow assumes an interactive session (the Notion connector is not available in
headless/scheduled runs). If Hevy or Notion is unreachable, say so and fall back to data
pasted into the chat — do not guess numbers. For Hevy specifically, work through
"If a Hevy call fails" below **before** falling back; an unexplained "it's blocked" is not
an acceptable diagnosis.

## Month-end closeout (first session on or after the 1st)

If the session is the first on or after the 1st of a month, the closing month needs
reconciling **before** anything else — run the End-of-Month Checklist in
`docs/GYM_DASHBOARD_INSTRUCTIONS.md`, then continue with the workflow above if there is
also a gym session to log. That one session owns the whole closeout: reconcile goal
statuses with Pawel, write the closing month's Notion summary, create the new month page
(dedup on the month), carry live trackers forward, calibrate and write the new goals, and
flip the Gym Hub index. A month is only `Closed` once its summary is written.

Do not leave the summary for "Chat at month end" — that split is retired, and it is why
July 2026 reached the 1st with an unwritten summary.

## Two-track publishing

`main` is the published artifact — GitHub Pages serves it, so a push is a publish. What
route a change takes depends on whether it can only change what the dashboard *says* or
also how it *behaves*.

**Track 1 — data. Straight to `main`, no branch, no PR.**
Adding rows and values. The page's behaviour is untouched; only its contents move.

- session rows in `exercises` / `graveyard` `data` arrays, and their `sets`
- `runs[]` entries, `scans[]` entries
- the `TODAY` constant
- note text, correction annotations, `**NOT trend-valid**` markers
- monthly hand-edits that follow directly from new data: Goals cards on rollover,
  adding a lift to `EXERCISE_ORDER`, moving a lift to the graveyard with its `reason`

**Track 2 — development. Branch + PR, Pawel merges.**
Anything that changes how the page works, or how this system works.

- renderers, chart config, tab structure, layout, CSS, event handlers
- new features, new data fields, new sections
- `scripts/` (validator, smoke, preflight), `package.json`, `.claude/`
- `CLAUDE.md`, `docs/`, `README.md`, `workflows.html` — including this file

Branch from current `main`, push the branch, open the PR with a summary of the diff, and
**stop there**. Pawel merges. Do not merge on his behalf, and do not merge because checks
are green — validate + smoke passing is the entry condition for a PR, not approval.

**The test, when a change sits between the two:** if the only thing a reader would notice
is different numbers or words, it is data. If a renderer, a script, or a doc changed, it is
development — even a one-line fix, even an obvious one. When genuinely unsure, ask Pawel
rather than guessing; a wrong call in the data direction publishes unreviewed code.

**Hevy data goes straight to `main`.** Session rows and their sets, the `TODAY` bump, notes,
correction annotations, goal card statuses that follow from the sets just logged. No branch,
no asking, no waiting — a gym session is never held up by a review.

**Recalculation is never data.** Anything that changes how a number is *derived* — adding or
removing a computed field, changing a formula, changing what a chart plots or how it is
structured — is not a data update, even when the only visible difference is different digits.
Say plainly that this is not a data change, explain the options and what each costs, and ask.
Never publish it to `main` on your own judgement.

Worked example (13/08/2026): removing the P(hit) percentages from the Goals cards changed
only text inside `renderGoals`, which passes the letter of the data test — but it was a
decision about what the section *shows*, reached by recalculation, and it belonged in a PR.
The digits-only test is necessary, not sufficient; apply the recalculation rule first.

A single session may do both. Land the data on `main` first so the dashboard is current,
then branch for the structural part — never hold a gym session's data hostage to a PR.

**Branch hygiene.** The harness assigns each session a working branch. On the data track
that branch is bookkeeping only: commit on it, `git merge --ff-only` into `main`, push
**`main` alone**. Never push the working branch on a data update — a pushed branch that
fast-forwarded into `main` is dead the moment it lands, and one per gym session accumulates
(five had by 02/08/2026). Fast-forward means `main`'s history is identical to committing
there directly. On the development track the branch is the deliverable, so it does get
pushed — and is deleted when the PR merges.

Note: a cloud session **cannot delete remote branches** — the git proxy returns HTTP 403
on a ref delete (pushing `main` is unaffected). Cleanup of a stale branch is Pawel's, from
GitHub's branches page. Hence: don't create the litter.

## Explaining the work

**Explain as if Pawel is new to the tooling — he is, and learning it is part of the point.**
He knows his training inside out; git, repos, branches, PRs and the modelling are what he is
picking up as this system runs. Name the concepts rather than assuming them. Say what each
step does and why, *before* doing it, not as a summary afterwards.

When a decision is his, state explicitly what he is deciding and what each option costs.
"Which of these do you want" beats a paragraph he has to reverse-engineer a question out of.

**Tell him what he can usefully check.** He is the human in the loop, and a checkpoint only
works if the person at it can see what is passing through. Be concrete: what to look at, what
would count as wrong, and what you could not verify yourself. The live render is the standing
example — `sldl145.github.io` is not reachable from a cloud session, so confirming a change
actually appeared is his job and nobody else's.

Being a teacher here is not decoration. It is what makes the recalculation rule above
function: he cannot approve what he cannot follow.

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
- **Environment requirement.** Hevy works only in a cloud environment that both defines
  `HEVY_API_KEY` and allowlists `api.hevyapp.com` for egress. That is a property of the
  environment, not of this repo or of the system — do not assume it holds in the session
  you are in, and do not record "it works" as a general fact.

### If a Hevy call fails — diagnose, never guess

A SessionStart hook (`scripts/hevy-preflight.sh`) probes Hevy at session start and its
verdict is already in your context. Re-run it any time with `npm run preflight`.

**Never call Hevy "blocked", "denied by network policy" or "unreachable" without a probe
result behind it, and never fall back to a pasted export before telling Pawel which row
below applies.** These three failures look nothing alike:

| Symptom | Meaning | Fix |
|---|---|---|
| HTTP `401`, body `InvalidApiKey` | Host reached fine; key missing/expired/revoked. **Not a network problem** — a 401 *proves* the host is allowlisted | Pawel: regenerate at hevy.com → Settings → Developer, set `HEVY_API_KEY` in the environment, start a **new** session |
| curl exit `56`, `CONNECT tunnel failed, response 403`, `%{http_code}` = `000` | Egress proxy refused the connection. **Not a key problem** | Pawel: claude.ai/code → environment selector → Custom network access → add `api.hevyapp.com` → **new** session. You cannot fix or route around this |
| any other curl exit (6/7/28/35) | Inconclusive / transient | Re-run `npm run preflight` and retry. Do **not** call it a policy block |

An egress denial never produces an HTTP 403 — the "403" appears only in curl's stderr.
Confirm with the proxy's own record before using the "blocked" wording:

    curl -sS "http://127.0.0.1:${HTTPS_PROXY##*:}/__agentproxy/status" | jq '.recentRelayFailures'

An entry with `"host": "api.hevyapp.com:443"` and `"kind": "connect_rejected"` is the only
evidence that justifies it — and even then the proxy classes that as *"policy denial **or
upstream failure**"*, so never claim it is permanent. Do not retry a denial in a loop;
report it (`/root/.ccr/README.md`).

**The failure mode that has actually happened** (02/08/2026): the environment selector is
per-surface, and on the phone it was left on `Default`, which has neither the key nor the
allowlist entry. Both symptoms appeared at once and looked like one mysterious outage.
Check the selector at the top of the app before concluding anything is broken.

A pasted export remains a legitimate fallback — but only **after** the matching row above
has been said out loud to Pawel, and every number written from it must be flagged as not
API-verified.

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
- **e1RM figures are always Brzycki, `w x 36/(37-r)`** — the formula the page's own
  `e1rm()` and Est. 1RM column use. Epley (`w x (1 + r/30)`) was retired 01/08/2026 after
  Session #117 found it overestimating by 4-5 kg. The validator errors on any `e1RM N.N`
  in a note that matches Epley for a set on that row, and warns on one it cannot derive
  from the row's sets at all (legitimate for cross-references and targets — check, don't
  ignore). Figures inside `[...]` are skipped, so correction annotations may quote the
  old numbers.
- Corrections: never silently rewrite history. Append
  `[Corrected DD/MM/YYYY from Hevy sets: was X x Y - value not found in any logged set. Heaviest-weight rule applied.]`
  A formula correction takes the same form but says what was restated and, if a claim
  rested on the wrong figure, **retires the claim explicitly rather than renumbering it**
  (precedents: RDL 10/08 fixed 13/08; the 14-row pass of 15/08/2026).

### Exercise lifecycle
- New movement appears once → **graveyard** with a `reason`, not the main charts
  (precedent: Single Leg Extensions #117, T Bar Row #119). Promote on second occurrence.
- Retired movements move from `exercises` to `graveyard` with `reason` + `lastSession`.
- `EXERCISE_ORDER` (in the script) controls chart order; lifts absent from it get a NEW
  badge. When a lift stops being new, add it to `EXERCISE_ORDER`.

### Goals cards
- **The Goals section shows goals and nothing else** (Pawel's call, 01/08). A card earns
  its place only by carrying a target with a live status. Program descriptions, open
  questions, PT decisions, probability watches, philosophy and month narrative do **not**
  go here — they live in Notion.
- Do not restate another tab. Running targets are computed live by `renderRunningGoals`
  on the Running tab; body composition lives on its own tab; injury state is the Injury
  Log section further down the Training tab.
- When no goals are agreed for the current month, `renderGoals` renders the empty state
  (`Currently no goals are set up.`) — do not backfill it with context to look full.
- Goals cards (`renderGoals`) are hand-edited HTML, monthly cadence. On rollover: delete
  the old month's cards and write the new month's; put the month back in the section
  label (`August 2026 Goals`). Superseded months are **not** archived in `index.html` —
  git history and the Notion session pages are the record. Update statuses when targets
  are hit. (Run/scan data conventions: see their sections above.)

## Verification

- `node scripts/validate.js` — data consistency + inline-script syntax. Must pass (exit 0).
- `node scripts/smoke.js` — renders the page in headless Chromium, clicks all three tabs,
  fails on any console/page error or undrawn chart. Must pass. (First run in a fresh
  container: `npm install` to get playwright-core; browsers are pre-installed at
  `/opt/pw-browsers` — never run `playwright install`.)
- Goals cards, `EXERCISE_ORDER`, and other hand-edited HTML: eyeball the rendered page.
- After pushing, the live page updates within ~a minute:
  https://sldl145.github.io/training-dashboard/ — spot-check the tab you touched.
  **This step needs Pawel's browser.** `sldl145.github.io` is not on the environment's
  egress allowlist, so a cloud session cannot fetch it (curl exit 56). Say the push is
  verified and the live render is not — do not claim to have checked it, and do not read
  the failure as the site being down. Adding `sldl145.github.io` alongside
  `api.hevyapp.com` in the environment's allowed domains would make this step runnable.

## History / provenance

- Until Aug 2026 this repo was updated by Cowork on a local machine and pushed manually;
  the Gym Hub page in Notion documents the system. Session journals remain in Notion —
  this repo is the rendered dashboard, Notion is the narrative record.
