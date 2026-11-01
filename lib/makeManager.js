/**
 * Agent-20 · Make.com Manager
 * REST client for Make (Integromat) API v2
 *
 * Env required:
 *   MAKE_API_KEY   = your API token (from Profile → API Access)
 *   MAKE_TEAM_ID   = numeric team id (from Make URL /team/XXXXX/...)
 *
 * Optional:
 *   MAKE_ZONE      = eu1 | eu2 | us1 | us2   (default: eu1)
 *   MAKE_BASE_URL  = full override, e.g. https://eu1.make.com/api/v2
 */

const ZONE = (process.env.MAKE_ZONE || 'eu1').toLowerCase().replace(/[^a-z0-9]/g, '');
const BASE = (
  process.env.MAKE_BASE_URL ||
  `https://${ZONE}.make.com/api/v2`
).replace(/\/$/, '');
const API_KEY = process.env.MAKE_API_KEY || '';
const TEAM_ID = process.env.MAKE_TEAM_ID || '';

function headers() {
  if (!API_KEY) throw new Error('MAKE_API_KEY is not set');
  return {
    Authorization: `Token ${API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function req(method, path, { query, body } = {}) {
  const url = new URL(`${BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 600) };
  }
  if (!res.ok) {
    const msg =
      data.message ||
      data.error ||
      data.detail ||
      (Array.isArray(data.errors) && data.errors[0]?.message) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function requireTeamId() {
  if (!TEAM_ID) throw new Error('MAKE_TEAM_ID is not set (find it in Make URL: /team/XXXXX/)');
  return TEAM_ID;
}

/* ------------------------------------------------------------------ */
/*  Scenarios                                                         */
/* ------------------------------------------------------------------ */

export async function listScenarios({ limit = 50, offset = 0, folderId } = {}) {
  const teamId = requireTeamId();
  const q = {
    teamId,
    'pg[limit]': Math.min(100, limit),
    'pg[offset]': offset,
  };
  if (folderId != null) q.folderId = folderId;
  return req('GET', '/scenarios', { query: q });
}

export async function getScenario(scenarioId) {
  return req('GET', `/scenarios/${scenarioId}`);
}

export async function runScenario(scenarioId, data) {
  const body = data ? { data } : undefined;
  return req('POST', `/scenarios/${scenarioId}/run`, { body });
}

/** Activate (turn scheduling on) */
export async function startScenario(scenarioId) {
  return req('POST', `/scenarios/${scenarioId}/start`);
}

/** Deactivate (turn scheduling off) */
export async function stopScenario(scenarioId) {
  return req('POST', `/scenarios/${scenarioId}/stop`);
}

export async function findScenario(nameOrId) {
  const idNum = Number(nameOrId);
  if (Number.isFinite(idNum) && String(idNum) === String(nameOrId).trim()) {
    try {
      const s = await getScenario(idNum);
      return s.scenario || s;
    } catch {
      /* fall through to name search */
    }
  }
  const data = await listScenarios({ limit: 100 });
  const list = data.scenarios || data || [];
  const q = String(nameOrId).toLowerCase().trim();
  return (
    list.find((s) => String(s.id) === String(nameOrId)) ||
    list.find((s) => (s.name || '').toLowerCase() === q) ||
    list.find((s) => (s.name || '').toLowerCase().includes(q)) ||
    null
  );
}

/* ------------------------------------------------------------------ */
/*  Hooks (webhooks)                                                  */
/* ------------------------------------------------------------------ */

export async function listHooks({ limit = 50 } = {}) {
  const teamId = requireTeamId();
  return req('GET', '/hooks', {
    query: { teamId, 'pg[limit]': Math.min(100, limit) },
  });
}

/* ------------------------------------------------------------------ */
/*  Teams / self-check                                                */
/* ------------------------------------------------------------------ */

export async function listTeams() {
  return req('GET', '/teams');
}

export async function whoami() {
  try {
    return await req('GET', '/users/me');
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Formatters                                                        */
/* ------------------------------------------------------------------ */

export function formatList(data) {
  const list = data.scenarios || data || [];
  const pg = data.pg || {};
  const lines = [
    `⚙️ *Make.com Scenarios* (${list.length}${pg.total != null ? ` / ${pg.total}` : ''})`,
    `Team: \`${TEAM_ID || '?'}\` · Zone: \`${ZONE}\``,
    '',
  ];
  if (!list.length) {
    lines.push('_No scenarios found. Check MAKE_TEAM_ID._');
    return lines.join('\n');
  }
  for (const s of list.slice(0, 40)) {
    const active = s.isPaused === false || s.scheduling ? '🟢' : '⏸';
    const invalid = s.isInvalid || s.isinvalid ? ' ⚠️' : '';
    lines.push(
      `${active} *${s.name || 'unnamed'}*${invalid}`,
      `   id: \`${s.id}\``,
      s.scheduling?.type ? `   schedule: ${s.scheduling.type}` : '   schedule: on-demand/paused',
      ''
    );
  }
  return lines.join('\n').trim();
}

export function formatStatus(s) {
  if (!s) return 'Scenario not found.';
  const sc = s.scenario || s;
  return [
    `⚙️ *${sc.name || sc.id}*`,
    `ID: \`${sc.id}\``,
    `Team: \`${sc.teamId || TEAM_ID}\``,
    sc.isPaused != null ? `Paused: ${sc.isPaused}` : '',
    sc.isInvalid || sc.isinvalid ? `Invalid: yes` : '',
    sc.scheduling ? `Scheduling: ${JSON.stringify(sc.scheduling)}` : '',
    sc.lastEdit ? `Last edit: ${sc.lastEdit}` : '',
    sc.created ? `Created: ${sc.created}` : '',
    sc.description ? `Desc: ${String(sc.description).slice(0, 200)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatHooks(data) {
  const list = data.hooks || data || [];
  const lines = [`🔗 *Make Webhooks / Hooks* (${list.length})`, ''];
  if (!list.length) {
    lines.push('_No hooks found._');
    return lines.join('\n');
  }
  for (const h of list.slice(0, 30)) {
    lines.push(
      `• *${h.name || h.hookName || h.id}*`,
      `  id: \`${h.id}\``,
      h.url ? `  ${h.url}` : '',
      h.scenarioId != null ? `  scenario: ${h.scenarioId}` : '',
      ''
    );
  }
  return lines.join('\n').trim();
}

export default {
  listScenarios,
  getScenario,
  runScenario,
  startScenario,
  stopScenario,
  findScenario,
  listHooks,
  listTeams,
  whoami,
  formatList,
  formatStatus,
  formatHooks,
};
