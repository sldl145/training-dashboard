# Training Dashboard

Pawel's training, body composition, and running dashboard — one self-contained page
(`index.html`), live at **https://sldl145.github.io/training-dashboard/** (GitHub Pages,
serves `main`; a push is a publish).

Maintained directly by Claude Code sessions. The full contract is in [`CLAUDE.md`](CLAUDE.md);
detailed manuals live in [`docs/`](docs/).

## How the system works

> **Rule (inherited from the old workflows.html):** any change to this workflow must
> update this diagram AND [`workflows.html`](workflows.html) (the Pawel-facing visual
> guide, served on Pages next to the dashboard) in the same session.

```mermaid
flowchart TD
    GYM["🏋️ Gym session at SATS<br/>(PT logs sets in Hevy)"] --> SESSION
    RUN["🏃 Run<br/>(Apple Watch)"] -->|screenshot pasted| SESSION
    SCAN["📊 InBody scan<br/>(photo pasted, monthly at SATS)"] --> SESSION
    WEIGH["⚖️ Withings Body Scan<br/>(daily weigh-in at home)"] -->|pulled from the Worker| SESSION

    subgraph SESSION["One Claude Code session — 'update dashboard'"]
        D1["Debrief conversation<br/>(docs/DEBRIEF.md)"] --> D2["Write Notion journal<br/>Session/Scan page or Run entry<br/>(dedup on date)"]
        D2 --> D3["Fetch ground truth<br/>Hevy API or pasted export<br/>(Hevy always wins)"]
        D3 --> D3W["Pull Withings weigh-ins<br/>everything since the last one on file<br/>(withings-mcp Worker)"]
        D3W --> D4["Targeted edits to index.html<br/>(TODAY bump, data appends, goals)"]
        D4 --> D5["Checks: scripts/validate.js<br/>+ scripts/smoke.js (real browser)"]
        D5 --> D6["git push main — data track<br/>+ check off Decisions in Notion"]
    end

    CHAT["💬 Claude Chat (optional fallback)<br/>debrief on the go → writes Notion journal<br/>+ unchecked Decisions"] -.-> D3

    D6 --> LIVE["🌐 Live dashboard<br/>sldl145.github.io/training-dashboard"]

    DEV["🛠️ Structure, feature, script or doc change<br/>(not data)"] --> DEVTRACK
    RECALC["🧮 Recalculation<br/>add/drop a computed field, change a formula,<br/>change what a chart plots"] --> ASK{"Say it is not a data change<br/>explain options, ask Pawel"}
    ASK --> DEVTRACK

    subgraph DEVTRACK["Development track — never straight to main"]
        V1["Branch from current main<br/>+ targeted edits"] --> V2["Checks: validate.js<br/>+ smoke.js"]
        V2 --> V3["Push branch, open PR<br/>with diff summary — session stops here"]
    end

    V3 --> MERGE{"Pawel reviews<br/>and merges"}
    MERGE --> LIVE

    NOTION[("Notion — Gym Hub<br/>Training Logs / Running Log / InBody DB<br/>(the narrative record)")] <--> D2

    MONTH["📅 First session on or after the 1st"] --> CLOSE

    subgraph CLOSE["Month-end closeout — same Claude Code session"]
        C1["Reconcile goal statuses<br/>against logged sets, with Pawel"] --> C2["Write month summary<br/>on the closing month's Notion page"]
        C2 --> C3["Create new month page<br/>dedup on month, carry live trackers"]
        C3 --> C4["Calibrate new goals from the data<br/>see docs: Goal Calibration"]
        C4 --> C5["Write renderGoals + flip Gym Hub index<br/>new month Active, old month Closed"]
    end

    C5 --> D5
    C2 <--> NOTION
    C3 <--> NOTION
```

- **Notion** is the narrative record (journals, flags, decisions, scan database) —
  everything hangs off the Gym Hub page.
- **Hevy** is ground truth for lifting numbers; any conflicting verbal/PT number is
  corrected to the Hevy sets with an annotation.
- **Withings** is ground truth for daily body composition, pulled from a Cloudflare Worker
  that holds the OAuth tokens. Numbers are never typed in from the phone app. The monthly
  SATS **InBody** scan stays a separate instrument on its own series — the two are never
  merged, calibrated against each other, or plotted on one axis.
- **This repo** is the rendered dashboard and the system of record for how updates work.
- **Two tracks.** Data (session rows, runs, scans, weigh-ins, `TODAY`, monthly goals cards) goes
  straight to `main` — a gym session is never held up by a review. Anything touching
  renderers, scripts, or docs goes via a branch and a PR that Pawel merges. Full boundary
  in [`CLAUDE.md`](CLAUDE.md) → Two-track publishing.
- **Recalculation is never data**, even when the only visible change is different digits.
  Adding or dropping a computed field, changing a formula, or changing what a chart plots
  gets flagged as *not* a data change, explained with its options, and asked about before
  anything is published.
- **Sessions explain as they go.** Pawel is learning git and the modelling alongside using
  the dashboard, so work is described in plain terms before it happens, decisions are stated
  as decisions, and each session says what he should check — including the live render,
  which a cloud session cannot reach.

## Repo map

| Path | Purpose |
|------|---------|
| `index.html` | The dashboard (Training / Body Composition / Running tabs) |
| `workflows.html` | Visual "how to update" guide — gym session, scan, run, month rollover — live at [/workflows.html](https://sldl145.github.io/training-dashboard/workflows.html) |
| `CLAUDE.md` | Session contract: workflow, house rules, conventions |
| `docs/GYM_DASHBOARD_INSTRUCTIONS.md` | Full operating manual (Hevy mapping, data rules, goals, graveyard) |
| `docs/DEBRIEF.md` | Post-session conversation guide + Notion journal formats |
| `docs/RUNNING_TAB_SPEC.md` | Running tab spec (data model, layout, charts) |
| `docs/WITHINGS_SPEC.md` | Withings weigh-in spec (Worker API, `weighins[]` schema, ingestion rule, Body Composition rendering) |
| `docs/DEPLOYMENT.md` | Hosting, publishing rules, troubleshooting |
| `scripts/validate.js` | Data consistency + syntax + button wiring + TODAY freshness — must exit 0 |
| `scripts/smoke.js` | Headless-Chromium render check of all three tabs — must pass |
| `scripts/hevy-preflight.sh`, `scripts/withings-preflight.sh` | SessionStart probes — say whether Hevy / Withings are reachable and, if not, whose problem it is (`npm run preflight` runs both) |
| `infra/withings-mcp/` | Source of the Cloudflare Worker that fronts the Withings API (deployed from the Cloudflare dashboard, not from this repo) |
| `assets/` | Vendored Chart.js + html2pdf (page has no external dependencies) |
