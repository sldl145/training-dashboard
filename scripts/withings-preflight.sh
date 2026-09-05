#!/usr/bin/env bash
# Withings preflight. Answers one question: can this session pull weigh-ins from the
# withings-mcp Worker right now -- and if not, whose problem is it?
#
#   bash scripts/withings-preflight.sh          human-readable; exit 0 if healthy, 1 otherwise
#   bash scripts/withings-preflight.sh --hook   one JSON object for the SessionStart hook;
#                                               ALWAYS exits 0
#
# SECRET HYGIENE: never add `set -x`, never `curl -v`, never echo $WITHINGS_TOKEN.
# The token is passed only via -H and never reaches stdout, stderr or the URL.
#
# NO `set -e` ON PURPOSE. A failing curl is the signal, not an error. Claude Code parses
# hook JSON only on exit 0. Same reasoning as scripts/hevy-preflight.sh.
set -u

MODE="${1:-text}"
HOST="withings-mcp.paul-rucki.workers.dev"
URL="https://${HOST}/status"

KEY="${WITHINGS_TOKEN:-}"
if [ -n "$KEY" ]; then
  KEYNOTE="WITHINGS_TOKEN present (${#KEY} chars)"
else
  KEYNOTE="WITHINGS_TOKEN is NOT set in this environment"
fi

# Locally there is no egress proxy, no token and no cloud environment to fix -- stay silent.
if [ "$MODE" = "--hook" ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi

RC=0; HTTP=""; BODY=""

attempt() {
  local out
  out=$(curl -sS --connect-timeout 3 --max-time 8 \
             -H "Authorization: Bearer ${KEY}" -w $'\n%{http_code}' "$URL" 2>&1)
  RC=$?
  HTTP=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d' | head -c 400)
}

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
AUTHED=$(printf '%s' "$BODY" | grep -oE '"authorised": *(true|false)' | grep -oE 'true|false' || true)
DAYS=$(printf '%s' "$BODY" | grep -oE '"refresh_token_days_left_est": *-?[0-9]+' | grep -oE -- '-?[0-9]+$' || true)
SYSMSG=""

if [ "$RC" -eq 0 ] && [ "$HTTP" = "200" ] && [ "$AUTHED" = "true" ]; then
STATE=OK
RENEW=""
if [ -n "$DAYS" ] && [ "$DAYS" -lt 30 ] 2>/dev/null; then
  RENEW="
RE-AUTH DUE: the Withings refresh token expires in about ${DAYS} days. Tell Pawel to open
https://${HOST}/auth in a browser (logged into Withings) once; nothing else changes."
  SYSMSG="Withings preflight: refresh token expires in ~${DAYS} days - open https://${HOST}/auth once to renew."
fi
MSG="WITHINGS PREFLIGHT: OK - ${HOST} reachable, token accepted, Withings authorised
(refresh token ~${DAYS:-?} days left). ${KEYNOTE}. Probe: GET /status -> HTTP 200.
Pull weigh-ins from the Worker directly (CLAUDE.md -> Withings weigh-ins, docs/WITHINGS_SPEC.md).
Do NOT ask Pawel to type numbers from the phone app.${RENEW}"

elif [ "$RC" -eq 0 ] && [ "$HTTP" = "200" ] && [ "$AUTHED" = "false" ]; then
STATE=REAUTH
SYSMSG="Withings preflight: Worker reachable but not authorised with Withings - open https://${HOST}/auth once."
MSG="WITHINGS PREFLIGHT: WORKER NOT AUTHORISED WITH WITHINGS - network and token are FINE.
${HOST} answered HTTP 200 but reports authorised=false: the Withings refresh token is
missing or expired (12-month limit). Fix (Pawel, in a browser logged into Withings):
open https://${HOST}/auth and approve. Then retry; no new session needed."

elif [ "$RC" -eq 0 ] && [ "$HTTP" = "401" ]; then
STATE=AUTH
MSG="WITHINGS PREFLIGHT: CREDENTIAL PROBLEM - THE NETWORK IS FINE.
${HOST} was reached over TLS and answered HTTP 401 unauthorised. Getting a 401 at all PROVES
the host is on this environment's egress allowlist. Cause: ${KEYNOTE} - the token is
missing, empty, or does not match the Worker's MCP_TOKEN secret.
Fix (Pawel must do this; you cannot):
  1. Cloudflare -> withings-mcp -> Settings -> Variables: check MCP_TOKEN (a changed secret
     needs a redeploy from Edit code to bind).
  2. claude.ai/code -> environment selector -> Environment variables -> set WITHINGS_TOKEN.
  3. Start a NEW session - env vars are read once at session start.
Tell Pawel before anything else. Continue the session without Withings data; the next
successful pull catches up automatically."

elif [ "$RC" -eq 0 ] && { [ "$HTTP" = "429" ] || [ "$HTTP" = "502" ] || [ "${HTTP:-0}" -ge 500 ] 2>/dev/null; }; then
STATE=DEGRADED
MSG="WITHINGS PREFLIGHT: DEGRADED - Worker reachable, token accepted, but /status returned
HTTP ${HTTP}. Body: ${BODY}
  502 -> the Worker could not talk to Withings (their API down, or a 601 rate-limit on an
         identical request inside 10 s). Wait 60 s, retry once.
  429/5xx -> Cloudflare-side. Retry later.
Network and credentials are both FINE; do not describe this as a policy or token problem."

elif [ "$RC" -eq 56 ]; then
STATE=BLOCKED
SYSMSG="Withings preflight: ${HOST} is not reachable from this session. Check the environment selector - it is per-surface and 'Default' does not allow this host."
MSG="WITHINGS PREFLIGHT: EGRESS BLOCKED - cannot reach ${HOST}.
The proxy refused the CONNECT for ${HOST}:443 on ${ATTEMPTS} attempt(s): curl exit 56, no
HTTP status. ${PROXY_NOTE:+Proxy status endpoint says: ${PROXY_NOTE}}
This is NOT a bad token (that would be HTTP 401 over a working connection). You cannot fix
this and MUST NOT try to route around it.
REQUIRED - say this to Pawel before continuing:
  \"I can't reach ${HOST} from this session. Check the environment selector at the top of
   the app: if it says 'Default', switch to 'training-dashboard' and start a new session.
   If it is already correct, the host needs adding under Custom network access. I'll carry
   on without Withings data; the next successful pull catches up.\"
${KEYNOTE} - if the token is also absent, that is the same single cause, not two faults."

else
STATE=INCONCLUSIVE
MSG="WITHINGS PREFLIGHT: INCONCLUSIVE - ${ATTEMPTS} attempt(s) failed with curl exit ${RC}
(6=DNS, 7=connect refused, 28=timeout, 35=TLS), HTTP '${HTTP:-none}'.
${PROXY_NOTE:+Proxy status endpoint says: ${PROXY_NOTE}}
${PROXY_NOTE:-The proxy recorded NO policy denial for this host.}
Looks TRANSIENT. Try the real call when you need the data; re-check with: npm run preflight.
Escalate to 'egress blocked' wording ONLY with curl exit 56 AND a matching
kind=connect_rejected entry for ${HOST}:443 in the proxy status endpoint."
fi

if [ "$MODE" = "--hook" ]; then
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg ctx "$MSG" --arg sys "$SYSMSG" \
      '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}
       + (if $sys == "" then {} else {systemMessage:$sys} end)'
  else
    printf '%s\n' "$MSG"
  fi
  exit 0
fi

printf '%s\n' "$MSG"
printf '\nstate=%s http=%s curl_exit=%s attempts=%s\n' "$STATE" "${HTTP:-none}" "$RC" "$ATTEMPTS"
[ "$STATE" = "OK" ] && exit 0 || exit 1
