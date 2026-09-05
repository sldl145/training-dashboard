#!/usr/bin/env bash
# Hevy API preflight. Answers one question: can this session fetch ground truth from
# api.hevyapp.com right now -- and if not, whose problem is it?
#
#   bash scripts/hevy-preflight.sh          human-readable; exit 0 if healthy, 1 otherwise
#   bash scripts/hevy-preflight.sh --hook    one JSON object for the SessionStart hook;
#                                            ALWAYS exits 0
#
# SECRET HYGIENE: never add `set -x`, never `curl -v`, never echo $HEVY_API_KEY.
# The key is passed only via -H and never reaches stdout, stderr or the URL.
#
# NO `set -e` ON PURPOSE. A failing curl is the signal, not an error. Claude Code parses
# hook JSON only on exit 0, so a non-zero exit would silently DISCARD the one verdict we
# most need to deliver -- the egress denial, where curl exits 56.
set -u

MODE="${1:-text}"
HOST="api.hevyapp.com"
URL="https://${HOST}/v1/workouts/count"

KEY="${HEVY_API_KEY:-}"
if [ -n "$KEY" ]; then
  KEYNOTE="HEVY_API_KEY present (${#KEY} chars)"
else
  KEYNOTE="HEVY_API_KEY is NOT set in this environment"
fi

# Locally there is no egress proxy, no key and no cloud environment to fix -- stay silent.
if [ "$MODE" = "--hook" ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi

RC=0; HTTP=""; BODY=""

attempt() {
  local out
  out=$(curl -sS --connect-timeout 3 --max-time 6 \
             -H "api-key: ${KEY}" -w $'\n%{http_code}' "$URL" 2>&1)
  RC=$?
  HTTP=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d' | head -c 200)
}

# The agent proxy's own record for this host -- authoritative, beats inferring from curl.
# Documented in /root/.ccr/README.md. Best effort: every message is correct without it.
proxy_verdict() {
  local port body
  port="${HTTPS_PROXY:-}"; port="${port##*:}"; port="${port%%/*}"
  case "$port" in ''|*[!0-9]*) return 1 ;; esac
  command -v jq >/dev/null 2>&1 || return 1
  body=$(curl -sS -m 3 "http://127.0.0.1:${port}/__agentproxy/status" 2>/dev/null) || return 1
  printf '%s' "$body" | jq -er --arg h "$HOST" '
    [.recentRelayFailures[]? | select(.host | startswith($h + ":"))] | last
    | "\(.kind) - \(.detail) (at \(.ts))"' 2>/dev/null
}

# rc 0  -> any HTTP status is a definitive answer; stop.
# rc 56 -> proxy refused CONNECT. ONE confirmation retry (~0.05s) to separate a one-off
#          gateway blip from a standing policy, without the retry loop that
#          /root/.ccr/README.md forbids for denials.
# other -> inconclusive; up to 3 attempts with short backoff.
i=1; ATTEMPTS=0
while :; do
  attempt; ATTEMPTS=$i
  [ "$RC" -eq 0 ] && break
  if [ "$RC" -eq 56 ]; then
    [ "$i" -ge 2 ] && break
  else
    [ "$i" -ge 3 ] && break
  fi
  sleep "$i"; i=$((i + 1))
done

PROXY_NOTE="$(proxy_verdict || true)"
COUNT=$(printf '%s' "$BODY" | grep -oE '"workout_count":[0-9]{1,9}' | grep -oE '[0-9]{1,9}' || true)
SYSMSG=""

if [ "$RC" -eq 0 ] && [ "$HTTP" = "200" ]; then
STATE=OK
MSG="HEVY PREFLIGHT: OK - api.hevyapp.com reachable, key accepted, ${COUNT:-?} workouts on file.
${KEYNOTE}. Probe: GET /v1/workouts/count -> HTTP 200.
Fetch ground truth from the Hevy API directly (CLAUDE.md -> Hevy API). Do NOT ask Pawel to
paste an export this session - the API is available and is the source of truth."

elif [ "$RC" -eq 0 ] && [ "$HTTP" = "401" ]; then
STATE=AUTH
MSG="HEVY PREFLIGHT: CREDENTIAL PROBLEM - THE NETWORK IS FINE.
api.hevyapp.com was reached over TLS and answered HTTP 401 InvalidApiKey. Getting a 401 at
all PROVES the host is on this environment's egress allowlist. This is NOT a network, proxy
or policy problem - do not describe it as one and do not go looking at network settings.
Cause: ${KEYNOTE} - the key is missing, empty, expired or revoked.
Fix (Pawel must do this; you cannot):
  1. hevy.com -> Settings -> Developer -> regenerate the API key.
  2. claude.ai/code -> environment selector -> Environment variables -> set HEVY_API_KEY.
  3. Start a NEW session - env vars are read once at session start.
Tell Pawel the above before anything else. Until fixed, a pasted Hevy export is the correct
fallback - but say WHY (bad key, not network), and flag every number written this session
as not API-verified."

elif [ "$RC" -eq 0 ] && { [ "$HTTP" = "429" ] || [ "${HTTP:-0}" -ge 500 ] 2>/dev/null; }; then
STATE=DEGRADED
MSG="HEVY PREFLIGHT: HEVY API DEGRADED - reachable, key accepted, but /v1/workouts/count
returned HTTP ${HTTP}. Network and credentials are both FINE; do not describe this as a
network-policy or API-key problem.
  429 -> Hevy rate limit. Wait ~60s and retry; do not hammer it.
  5xx -> Hevy-side outage. Retry later.
Re-check with: npm run preflight. Fall back to a pasted export only if it stays broken, and
say which of the two it was."

elif [ "$RC" -eq 56 ]; then
STATE=BLOCKED
SYSMSG="Hevy preflight: api.hevyapp.com is not reachable from this session. Check the environment selector at the top of the app - it is per-surface and defaults to 'Default', which does not allow Hevy."
MSG="HEVY PREFLIGHT: EGRESS BLOCKED - cannot reach ${HOST}.
The proxy refused the CONNECT for ${HOST}:443 on ${ATTEMPTS} attempt(s): curl exit 56,
'CONNECT tunnel failed, response 403', no HTTP status (%{http_code}=000).
${PROXY_NOTE:+Proxy status endpoint says: ${PROXY_NOTE}}
This is NOT a bad API key. A bad key returns HTTP 401 InvalidApiKey over a working
connection; here we never got an HTTP status at all. You cannot fix this and MUST NOT try
to route around it (per /root/.ccr/README.md: report policy denials, do not retry them).
MOST LIKELY CAUSE - this exact thing happened on 02/08/2026: the environment selector is
per-surface and was left on 'Default', which defines neither HEVY_API_KEY nor the Hevy
allowlist entry. ${KEYNOTE} - if the key is also absent, that is the same single cause, not
two faults.
REQUIRED - say this to Pawel before any fallback:
  \"I can't reach api.hevyapp.com from this session. First check the environment selector at
   the top of the app: if it says 'Default', switch it to 'training-dashboard' and start a
   new session - that alone usually fixes it. If it is already correct, the host needs
   adding under Custom network access. Meanwhile I can work from a pasted Hevy export, but
   the numbers won't be API-verified.\"
The proxy classes this as 'policy denial OR upstream failure', so do NOT claim it is
permanent or definitely an allowlist decision. Only after surfacing the above may you use a
pasted export, and every number written must be marked not-API-verified."

else
STATE=INCONCLUSIVE
MSG="HEVY PREFLIGHT: INCONCLUSIVE - ${ATTEMPTS} attempt(s) failed with curl exit ${RC}
(6=DNS, 7=connect refused, 28=timeout, 35=TLS), HTTP '${HTTP:-none}'.
${PROXY_NOTE:+Proxy status endpoint says: ${PROXY_NOTE}}
${PROXY_NOTE:-The proxy recorded NO policy denial for this host.}
This looks TRANSIENT. Do NOT tell Pawel the host is blocked and do NOT jump to a pasted
export. Try the real Hevy call when you need the data; re-check with: npm run preflight
Escalate to 'egress blocked' wording ONLY with curl exit 56 AND a matching
kind=connect_rejected entry for api.hevyapp.com:443 in the proxy status endpoint."
fi

if [ "$MODE" = "--hook" ]; then
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg ctx "$MSG" --arg sys "$SYSMSG" \
      '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}
       + (if $sys == "" then {} else {systemMessage:$sys} end)'
  else
    printf '%s\n' "$MSG"   # plain stdout is also added to SessionStart context
  fi
  exit 0                   # ALWAYS. Non-zero would discard the JSON above.
fi

printf '%s\n' "$MSG"
printf '\nstate=%s http=%s curl_exit=%s attempts=%s\n' "$STATE" "${HTTP:-none}" "$RC" "$ATTEMPTS"
[ "$STATE" = "OK" ] && exit 0 || exit 1
