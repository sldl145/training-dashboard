# withings-mcp (Cloudflare Worker)

The service that stands between this repo and Withings. It holds the OAuth tokens, refreshes
them itself, and exposes the readings over a small REST API and an MCP endpoint. **It stores
no readings** — Withings remains the source, this repo remains the record.

`worker.js` here is a **mirror of what is deployed**, kept for review and history. Editing it
here changes nothing that runs. See *Deploying* below.

Consumers: `scripts/withings-preflight.sh` (SessionStart probe) and the ingestion rule in
`docs/WITHINGS_SPEC.md`. Live at `https://withings-mcp.paul-rucki.workers.dev`.

## Deploying

**Deployed by hand from the Cloudflare dashboard — Workers & Pages → `withings-mcp` → Edit
code → Deploy.** Not with `wrangler`, and not through Workers Builds. There is no CI, no
`wrangler.toml`, and no deploy step in this repo. A change to `worker.js` here is not live
until it is pasted into the dashboard editor and deployed there.

**A changed secret does not take effect until you redeploy.** Setting or rotating a secret in
Settings → Variables saves the value but does not rebind it to the running Worker: you must go
back to Edit code and hit Deploy for the new value to be picked up. (Learned the hard way on
05/09/2026 — a correct, freshly-set `MCP_TOKEN` kept returning 401 until a redeploy bound it.)

## Configuration

| Kind | Name | What it is |
|---|---|---|
| Secret | `WITHINGS_CLIENT_ID` | Withings developer app, client id |
| Secret | `WITHINGS_CLIENT_SECRET` | Withings developer app, client secret |
| Secret | `MCP_TOKEN` | Shared secret this repo authenticates with; the value of `WITHINGS_TOKEN` in the Claude Code environment |
| KV namespace | `TOKENS` | Stores the OAuth token pair and the short-lived `oauth_state` nonce |

`MCP_TOKEN` and `WITHINGS_TOKEN` are the same string in two places. If they drift, the probe
reports HTTP 401 — a credential fault, not a network one.

## The yearly chore

Withings refresh tokens expire after 12 months. When `/status` reports
`refresh_token_days_left_est` under 30, the preflight surfaces it and the fix is one browser
visit: open `https://withings-mcp.paul-rucki.workers.dev/auth` while logged into Withings and
approve. Tokens rotate on every refresh and the Worker persists the new pair itself; nothing
else needs touching, and weigh-ins taken while it was lapsed arrive with the next pull.

Only Withings user `17888711` may bind tokens (`ALLOWED_USERID` in `worker.js`) — approving
from any other account is refused with a 403.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /auth` | none | Starts OAuth. Open in a browser, once a year. |
| `GET /callback` | none | Withings redirects here; exchanges the code, stores the tokens. |
| `GET /status` | yes | Token health: authorised, access-token minutes left, refresh-token days left. |
| `GET /api/measures` | yes | Weigh-ins, newest first, one row per weigh-in. **The route this dashboard uses.** |
| `GET /api/activity` | yes | Daily steps, distance, active minutes, calories, HR zones. Not yet consumed. |
| `GET /api/sleep` | yes | Nightly summaries. Empty — no Withings sleep device. |
| `GET /api/all` | yes | The three above in one call. |
| `POST /mcp` | yes | MCP Streamable-HTTP endpoint (5 tools). |

Authentication is `Authorization: Bearer <MCP_TOKEN>`. The Worker also accepts the token as
the final path segment (`/api/all/<token>`) for clients that cannot set headers — **prefer the
header**, since a token in a URL lands in logs and history.

Range: `?days=N` (default 30) or `?start=YYYY-MM-DD&end=YYYY-MM-DD`. Dates are
Copenhagen-local (`TZ` in `worker.js`).

## Behaviour worth knowing before reading a payload

- **Groups are merged on timestamp.** Withings splits one weigh-in across several measurement
  groups (composition, water, heart rate); the Worker folds everything sharing a timestamp
  into a single row, so one row means one time on the scale.
- **`complete: false` means the impedance measurement failed** — weight was recorded, body
  composition was not. The ingestion rule drops these. In practice it shows up as a failed
  attempt followed by a good one a minute or so later.
- **`algo` is the scale's composition-model version**, carried through from the segmental
  measurements. A step in any composition series that coincides with an `algo` change is the
  scale, not the body. The dashboard marks these and restarts its rolling mean there.
- **Unrecognised measurement types pass through as `undocumented_<N>`** rather than being
  dropped. They are deliberately not copied into `index.html`: this is a public repo and
  unnamed physiological data has no business in it.
- **Rate limit.** Withings returns `601 Same arguments in less than 10 seconds` on an
  identical repeated request. Do not retry the same call inside 10 s. Slice backfills longer
  than about a year by year.

## Known drift from the live comments

The `SEGMENT` comment in `worker.js` still says the left/right mapping is "to be confirmed
against the Withings app". It was confirmed on 05/09/2026 (position 10 = left leg,
11 = right leg, 2 = left arm, 3 = right arm, 12 = trunk) and `docs/WITHINGS_SPEC.md` records
it. The comment is stale, not the code. It is left as-is here so this file matches what is
actually deployed; correcting it means editing in the Cloudflare dashboard, deploying, and
re-mirroring the file — not editing this copy alone.
