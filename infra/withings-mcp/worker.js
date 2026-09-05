/**
 * withings-mcp - Cloudflare Worker
 *
 * Routes
 *   GET  /auth       start Withings OAuth (open once a year in a browser)
 *   GET  /callback   Withings redirects here; exchanges code, stores tokens in KV
 *   GET  /status            token health
 *   GET  /api/measures      all scale/BP/temp/etc. measurements, newest first
 *   GET  /api/activity      daily activity summaries
 *   GET  /api/sleep         nightly sleep summaries
 *   GET  /api/all           the three above in one call
 *   POST /mcp               MCP Streamable-HTTP endpoint
 *   Protected routes take the token as "Authorization: Bearer <t>" or as the last path
 *   segment (/api/all/<t>). Query: ?days=N (default 30) or ?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Bindings / secrets
 *   env.TOKENS                  KV namespace
 *   env.WITHINGS_CLIENT_ID      secret
 *   env.WITHINGS_CLIENT_SECRET  secret
 *   env.MCP_TOKEN               secret (shared with Claude Code)
 */

const ALLOWED_USERID = "17888711";           // only this Withings account may bind tokens
const TZ = "Europe/Copenhagen";
const SCOPES = "user.info,user.metrics,user.activity,user.sleepevents";
const WBS = "https://wbsapi.withings.net";
const AUTH_URL = "https://account.withings.com/oauth2_user/authorize2";

// Withings measurement types -> field names (developer.withings.com/api-reference, verified 05/09/2026).
// Undocumented types come through as undocumented_N.
const MEAS = {
  1: "weight_kg", 4: "height_m", 5: "fat_free_mass_kg", 6: "fat_pct", 8: "fat_mass_kg",
  9: "diastolic_mmhg", 10: "systolic_mmhg", 11: "heart_rate_bpm", 12: "temperature_c",
  54: "spo2_pct", 71: "body_temperature_c", 73: "skin_temperature_c", 76: "muscle_mass_kg",
  77: "hydration_kg", 88: "bone_mass_kg", 91: "pulse_wave_velocity_ms", 123: "vo2max",
  130: "afib_ecg", 135: "qrs_ms", 136: "pr_ms", 137: "qt_ms", 138: "qtc_ms", 139: "afib_ppg",
  155: "vascular_age_y", 167: "nerve_health_score", 168: "extracellular_water_kg",
  169: "intracellular_water_kg", 170: "visceral_fat_index", 173: "fat_free_mass_segments_kg",
  174: "fat_mass_segments_kg", 175: "muscle_mass_segments_kg", 196: "nerve_response_score",
  226: "basal_metabolic_rate_kcal", 227: "metabolic_age_y",
};
const SEGMENTAL = new Set([173, 174, 175]);
// Body Scan segment positions. Trunk is unambiguous; left/right assignment to be confirmed
// against the Withings app once - see docs/WITHINGS_SPEC.md in the dashboard repo.
const SEGMENT = { 2: "left_arm", 3: "right_arm", 10: "left_leg", 11: "right_leg", 12: "trunk" };

// ---------- helpers ----------
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj, null, 2), {
    status, headers: { "content-type": "application/json", ...extra },
  });

const redirectUri = (req) => new URL(req.url).origin + "/callback";

const authed = (req, env) =>
  req.headers.get("authorization") === `Bearer ${env.MCP_TOKEN}`;

const iso = (unix) =>
  new Date(unix * 1000).toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T");

const ymd = (d) => d.toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD

function dateRange(args) {
  // Accepts {days} or {start,end} as YYYY-MM-DD. Default: last 30 days.
  const now = new Date();
  let end = args.end ? new Date(args.end + "T23:59:59") : now;
  let start = args.start
    ? new Date(args.start + "T00:00:00")
    : new Date(end.getTime() - (args.days ?? 30) * 86400000);
  return { start, end };
}

async function withingsPost(env, path, form, accessToken) {
  const body = new URLSearchParams(form);
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const r = await fetch(WBS + path, { method: "POST", body, headers });
  const data = await r.json();
  if (data.status !== 0 && data.status !== 100) {
    throw new Error(`Withings ${path} status ${data.status}: ${data.error ?? ""}`);
  }
  return data.body ?? {};
}

// ---------- token store ----------
async function loadTokens(env) {
  const raw = await env.TOKENS.get("tokens");
  return raw ? JSON.parse(raw) : null;
}

async function saveTokens(env, body) {
  const t = {
    userid: String(body.userid),
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 10800),
    refresh_issued_at: Math.floor(Date.now() / 1000),
    scope: body.scope,
  };
  await env.TOKENS.put("tokens", JSON.stringify(t));
  return t;
}

async function getAccessToken(env) {
  let t = await loadTokens(env);
  if (!t) throw new Error("Not authorised. Open /auth in a browser.");
  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at - now > 120) return t.access_token;
  // refresh (rotates refresh_token - always persist the new one)
  const body = await withingsPost(env, "/v2/oauth2", {
    action: "requesttoken",
    client_id: env.WITHINGS_CLIENT_ID,
    client_secret: env.WITHINGS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
  });
  t = await saveTokens(env, body);
  return t.access_token;
}

// ---------- Withings data ----------
async function getMeasures(env, { start, end }, raw = false) {
  const token = await getAccessToken(env);
  const groups = [];
  let offset = null;
  do {
    const form = {
      action: "getmeas",          // no meastypes filter: return everything the account has
      category: 1,
      startdate: Math.floor(start.getTime() / 1000),
      enddate: Math.floor(end.getTime() / 1000),
    };
    if (offset) form.offset = offset;
    const body = await withingsPost(env, "/measure", form, token);
    groups.push(...(body.measuregrps ?? []));
    offset = body.more ? body.offset : null;
  } while (offset);
  if (raw) return groups;

  // Withings splits one weigh-in into several groups (composition / water / HR):
  // merge everything with the same timestamp into one row.
  const byTime = new Map();
  for (const g of groups) {
    const key = g.date;
    const row = byTime.get(key) ?? { datetime: iso(g.date), sources: new Set() };
    if (g.model) row.sources.add(g.model);
    for (const m of g.measures) {
      const decoded = +(m.value * Math.pow(10, m.unit)).toFixed(3);
      const name = MEAS[m.type] ?? `undocumented_${m.type}`;
      if (SEGMENTAL.has(m.type)) {
        const seg = SEGMENT[m.position] ?? `position_${m.position}`;
        (row[name] ??= {})[seg] = decoded;
        if (m.algo) row.algo = m.algo;   // composition algorithm version - changes mark trend breaks
      } else if (row[name] !== undefined && row[name] !== decoded) {
        row[name] = [].concat(row[name], decoded); // same type twice in one weigh-in
      } else {
        row[name] = decoded;
      }
    }
    byTime.set(key, row);
  }
  return [...byTime.values()]
    .map((r) => {
      r.sources = [...r.sources];
      // scale weigh-in with no impedance data = incomplete body composition
      if (r.weight_kg != null) r.complete = r.fat_pct != null;
      return r;
    })
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
}

async function getActivity(env, { start, end }) {
  const token = await getAccessToken(env);
  const out = [];
  let offset = null;
  do {
    const form = {
      action: "getactivity",
      startdateymd: ymd(start),
      enddateymd: ymd(end),
      data_fields: "steps,distance,elevation,soft,moderate,intense,active,calories,totalcalories,hr_average,hr_min,hr_max,hr_zone_0,hr_zone_1,hr_zone_2,hr_zone_3",
    };
    if (offset) form.offset = offset;
    const body = await withingsPost(env, "/v2/measure", form, token);
    out.push(...(body.activities ?? []));
    offset = body.more ? body.offset : null;
  } while (offset);
  return out.map((a) => ({
    date: a.date, steps: a.steps, distance_km: +((a.distance ?? 0) / 1000).toFixed(2),
    active_min: Math.round((a.active ?? 0) / 60), moderate_min: Math.round((a.moderate ?? 0) / 60),
    intense_min: Math.round((a.intense ?? 0) / 60), calories: a.calories, total_calories: a.totalcalories,
    hr_avg: a.hr_average, hr_min: a.hr_min, hr_max: a.hr_max,
    hr_zone_min: [a.hr_zone_0, a.hr_zone_1, a.hr_zone_2, a.hr_zone_3].map((s) => Math.round((s ?? 0) / 60)),
  })).sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function getSleep(env, { start, end }) {
  const token = await getAccessToken(env);
  const out = [];
  let offset = null;
  do {
    const form = {
      action: "getsummary",
      startdateymd: ymd(start),
      enddateymd: ymd(end),
      data_fields: "total_sleep_time,total_timeinbed,sleep_efficiency,sleep_latency,wakeup_latency,waso,deepsleepduration,lightsleepduration,remsleepduration,wakeupcount,hr_average,hr_min,hr_max,rr_average,snoring,sleep_score,apnea_hypopnea_index",
    };
    if (offset) form.offset = offset;
    const body = await withingsPost(env, "/v2/sleep", form, token);
    out.push(...(body.series ?? []));
    offset = body.more ? body.offset : null;
  } while (offset);
  return out.map((s) => {
    const d = s.data ?? {};
    const min = (v) => (v == null ? null : Math.round(v / 60));
    return {
      date: s.date, bed_in: iso(s.startdate), bed_out: iso(s.enddate),
      sleep_min: min(d.total_sleep_time), in_bed_min: min(d.total_timeinbed),
      efficiency_pct: d.sleep_efficiency == null ? null : Math.round(d.sleep_efficiency * 100),
      deep_min: min(d.deepsleepduration), light_min: min(d.lightsleepduration), rem_min: min(d.remsleepduration),
      awake_min: min(d.waso), wakeups: d.wakeupcount, sleep_score: d.sleep_score,
      hr_avg: d.hr_average, hr_min: d.hr_min, hr_max: d.hr_max, resp_rate: d.rr_average,
      snoring_min: min(d.snoring), ahi: d.apnea_hypopnea_index,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function status(env) {
  const t = await loadTokens(env);
  if (!t) return { authorised: false, action: "Open /auth in a browser" };
  const now = Math.floor(Date.now() / 1000);
  const refreshAgeDays = Math.floor((now - t.refresh_issued_at) / 86400);
  const daysLeft = 365 - refreshAgeDays;
  return {
    authorised: true, userid: t.userid, scope: t.scope,
    access_token_expires_in_min: Math.max(0, Math.floor((t.expires_at - now) / 60)),
    refresh_token_days_left_est: daysLeft,
    warning: daysLeft < 30 ? "Refresh token nearing 12-month limit: re-run /auth" : null,
  };
}

// ---------- MCP ----------
const TOOLS = [
  {
    name: "latest_body_composition",
    description: "Most recent complete weigh-in from the Withings scale: weight, fat %, fat mass, muscle, hydration, bone, heart rate, PWV. Also returns the latest incomplete entry if newer.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "body_composition_history",
    description: "All weigh-ins in a period, newest first. Use for trends. Args: days (default 30) or start/end as YYYY-MM-DD.",
    inputSchema: { type: "object", properties: {
      days: { type: "integer" }, start: { type: "string" }, end: { type: "string" },
    } },
  },
  {
    name: "activity",
    description: "Daily steps, distance, active minutes, calories, heart-rate zones. Args: days (default 30) or start/end YYYY-MM-DD.",
    inputSchema: { type: "object", properties: {
      days: { type: "integer" }, start: { type: "string" }, end: { type: "string" },
    } },
  },
  {
    name: "sleep",
    description: "Nightly sleep summaries (duration, stages, score, HR, resp rate) where a Withings sleep device recorded. Args: days (default 30) or start/end YYYY-MM-DD.",
    inputSchema: { type: "object", properties: {
      days: { type: "integer" }, start: { type: "string" }, end: { type: "string" },
    } },
  },
  {
    name: "status",
    description: "Withings connection health: authorised, token ages, days until yearly re-authorisation.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(env, name, args = {}) {
  switch (name) {
    case "latest_body_composition": {
      const rows = await getMeasures(env, dateRange({ days: 60 }));
      const complete = rows.find((r) => r.complete && r.weight_kg);
      const newest = rows[0];
      return { latest_complete: complete ?? null, newest_entry: newest ?? null };
    }
    case "body_composition_history": return await getMeasures(env, dateRange(args));
    case "activity": return await getActivity(env, dateRange(args));
    case "sleep": return await getSleep(env, dateRange(args));
    case "status": return await status(env);
    default: throw new Error(`Unknown tool ${name}`);
  }
}

async function handleMcp(req, env) {
  if (req.method === "DELETE") return new Response(null, { status: 200 });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let msg;
  try { msg = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const reply = (id, result) => json({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => json({ jsonrpc: "2.0", id, error: { code, message } });

  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "withings-mcp", version: "1.0.0" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return new Response(null, { status: 202 });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      try {
        const result = await callTool(env, params.name, params.arguments);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      await env.TOKENS.put("oauth_state", state, { expirationTtl: 600 });
      const q = new URLSearchParams({
        response_type: "code", client_id: env.WITHINGS_CLIENT_ID, scope: SCOPES,
        redirect_uri: redirectUri(req), state,
      });
      return Response.redirect(`${AUTH_URL}?${q}`, 302);
    }

    if (url.pathname === "/callback") {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const expected = await env.TOKENS.get("oauth_state");
      if (!state || state !== expected) return new Response("State mismatch or expired. Open /auth again.", { status: 400 });
      await env.TOKENS.delete("oauth_state");
      if (!code) return new Response("No code returned: " + url.search, { status: 400 });
      try {
        const body = await withingsPost(env, "/v2/oauth2", {
          action: "requesttoken", client_id: env.WITHINGS_CLIENT_ID, client_secret: env.WITHINGS_CLIENT_SECRET,
          grant_type: "authorization_code", code, redirect_uri: redirectUri(req),
        });
        if (String(body.userid) !== ALLOWED_USERID) {
          return new Response(`Refused: Withings user ${body.userid} is not the allowed account.`, { status: 403 });
        }
        await saveTokens(env, body);
        return new Response(`Withings authorised for user ${body.userid}. Scope: ${body.scope}. You can close this tab.`);
      } catch (e) {
        return new Response("Token exchange failed: " + e.message, { status: 502 });
      }
    }

    // Protected routes. Token as "Authorization: Bearer <t>" header OR as final path segment.
    const m = url.pathname.match(/^\/(status|mcp|api\/(measures|activity|sleep|all))(?:\/([^/]+))?$/);
    if (m) {
      const pathToken = m[3] ? decodeURIComponent(m[3]) : null;
      if (!(authed(req, env) || pathToken === env.MCP_TOKEN)) return json({ error: "unauthorised" }, 401);
      const route = m[1];
      if (route === "status") return json(await status(env));
      if (route === "mcp") return handleMcp(req, env);
      // REST (GET): ?days=N or ?start=YYYY-MM-DD&end=YYYY-MM-DD
      const q = Object.fromEntries(url.searchParams);
      const args = { days: q.days ? +q.days : undefined, start: q.start, end: q.end };
      const range = dateRange(args);
      try {
        if (route === "api/measures") return json(await getMeasures(env, range, q.raw === "1"));
        if (route === "api/activity") return json(await getActivity(env, range));
        if (route === "api/sleep") return json(await getSleep(env, range));
        await getAccessToken(env); // refresh once here, so the parallel calls below never race
        const [measures, activity, sleep] = await Promise.all([
          getMeasures(env, range), getActivity(env, range), getSleep(env, range),
        ]);
        return json({ range: { start: ymd(range.start), end: ymd(range.end), tz: TZ }, measures, activity, sleep });
      } catch (e) {
        return json({ error: e.message }, 502);
      }
    }

    return new Response("withings-mcp", { status: 200 });
  },
};
