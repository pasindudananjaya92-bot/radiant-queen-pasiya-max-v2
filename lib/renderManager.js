// lib/renderManager.js — Agent-31 Render Manager (API)
// Env: RENDER_API_KEY (required), optional RENDER_OWNER_ID / filter by name

const API = 'https://api.render.com/v1';

function token() {
  return String(process.env.RENDER_API_KEY || process.env.RENDER_TOKEN || '').trim();
}

export function renderStatus() {
  return {
    ready: Boolean(token()),
    api: API,
  };
}

async function renderFetch(path, options = {}) {
  const t = token();
  if (!t) throw new Error('RENDER_API_KEY missing — Render Dashboard → Account Settings → API Keys');
  const url = path.startsWith('http') ? path : API + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + t,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && (body.message || body.error)) ||
      (typeof body === 'string' ? body.slice(0, 240) : JSON.stringify(body).slice(0, 240));
    throw new Error(`Render HTTP ${res.status}: ${msg}`);
  }
  return body;
}

/** List services (web + workers) */
export async function listServices({ limit = 20 } = {}) {
  // API returns array of { cursor, service } or plain services depending on version
  const data = await renderFetch('/services?limit=' + Math.min(50, limit));
  const rows = Array.isArray(data)
    ? data.map((row) => row.service || row)
    : data?.services || [];
  return rows;
}

export async function getService(id) {
  const data = await renderFetch('/services/' + encodeURIComponent(id));
  return data?.service || data;
}

export async function triggerDeploy(serviceId) {
  const data = await renderFetch('/services/' + encodeURIComponent(serviceId) + '/deploys', {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  return data?.deploy || data;
}

export async function listDeploys(serviceId, { limit = 5 } = {}) {
  const data = await renderFetch(
    '/services/' + encodeURIComponent(serviceId) + '/deploys?limit=' + limit
  );
  const rows = Array.isArray(data) ? data.map((r) => r.deploy || r) : data?.deploys || [];
  return rows;
}

/** Best-effort logs: recent deploy events (full live log stream needs dashboard/SSE) */
export async function getRecentDeploySummary(serviceId) {
  const deploys = await listDeploys(serviceId, { limit: 3 });
  return deploys;
}

/** Resolve service by id or name substring */
export async function resolveService(idOrName) {
  const q = String(idOrName || '').trim();
  if (!q) throw new Error('service id or name required');
  // Prefer direct id fetch
  try {
    const s = await getService(q);
    if (s?.id) return s;
  } catch (_) {}
  const all = await listServices({ limit: 50 });
  const low = q.toLowerCase();
  const hit =
    all.find((s) => String(s.id) === q) ||
    all.find((s) => String(s.name || '').toLowerCase() === low) ||
    all.find((s) => String(s.name || '').toLowerCase().includes(low));
  if (!hit) throw new Error('Service not found: ' + q);
  return hit;
}

export function formatServices(list) {
  if (!list?.length) return 'No Render services found.';
  const lines = ['🖥 *Render services*', ''];
  for (const s of list.slice(0, 15)) {
    const type = s.type || s.serviceDetails?.type || '?';
    const st = s.suspended === 'suspended' ? 'suspended' : s.serviceDetails?.buildStatus || s.status || 'ok';
    lines.push(`• \`${s.id}\``);
    lines.push(`  ${s.name || '?'} · ${type} · ${st}`);
  }
  lines.push('', '_Deploy:_ `render deploy <id|name>`');
  lines.push('_Info:_ `render service <id|name>`');
  return lines.join('\n').slice(0, 3500);
}

export function formatService(s) {
  if (!s) return 'Not found';
  return (
    `🖥 *${s.name || s.id}*\n` +
    `ID: \`${s.id}\`\n` +
    `Type: ${s.type || s.serviceDetails?.type || '?'}\n` +
    `Repo: ${s.repo || s.repository || '?'}\n` +
    `Branch: ${s.branch || '?'}\n` +
    `Region: ${s.region || '?'}\n` +
    `Suspended: ${s.suspended || 'no'}\n` +
    `Updated: ${s.updatedAt || s.updated_at || '?'}`
  ).slice(0, 3500);
}

export function formatDeploys(deploys) {
  if (!deploys?.length) return 'No deploys.';
  const lines = ['🚀 *Recent deploys*', ''];
  for (const d of deploys.slice(0, 5)) {
    lines.push(`• \`${d.id}\` · ${d.status || '?'} · ${d.createdAt || d.created_at || ''}`);
    if (d.commit?.message) lines.push(`  ${String(d.commit.message).slice(0, 80)}`);
  }
  return lines.join('\n').slice(0, 3500);
}

export default {
  renderStatus,
  listServices,
  getService,
  triggerDeploy,
  listDeploys,
  resolveService,
  formatServices,
  formatService,
  formatDeploys,
};
