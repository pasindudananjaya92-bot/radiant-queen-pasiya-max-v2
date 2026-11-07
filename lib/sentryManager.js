// lib/sentryManager.js — Manage Sentry issues from Telegram (API token, not DSN alone)

function cfg() {
  return {
    token: String(process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_TOKEN || '').trim(),
    org: String(process.env.SENTRY_ORG || process.env.SENTRY_ORG_SLUG || '').trim(),
    project: String(process.env.SENTRY_PROJECT || process.env.SENTRY_PROJECT_SLUG || '').trim(),
    dsn: String(process.env.SENTRY_DSN || '').trim(),
  };
}

export function sentryStatus() {
  const c = cfg();
  return {
    dsn: Boolean(c.dsn),
    token: Boolean(c.token),
    org: c.org || '(missing)',
    project: c.project || '(missing)',
    ready: Boolean(c.token && c.org && c.project),
  };
}

async function sentryFetch(path, options = {}) {
  const c = cfg();
  if (!c.token) throw new Error('SENTRY_AUTH_TOKEN missing — create Auth Token in Sentry');
  if (!c.org || !c.project) throw new Error('Set SENTRY_ORG and SENTRY_PROJECT env');

  const url = path.startsWith('http') ? path : `https://sentry.io/api/0${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + c.token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
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
      (body && body.detail) ||
      (typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200));
    throw new Error(`Sentry HTTP ${res.status}: ${msg}`);
  }
  return body;
}

export async function listIssues({ limit = 10, query = 'is:unresolved' } = {}) {
  const c = cfg();
  const q = new URLSearchParams({
    query: query,
    limit: String(Math.min(25, limit)),
  });
  const data = await sentryFetch(
    `/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(c.project)}/issues/?${q}`
  );
  return Array.isArray(data) ? data : [];
}

export async function getIssue(id) {
  return sentryFetch(`/issues/${encodeURIComponent(id)}/`);
}

export async function resolveIssue(id) {
  return sentryFetch(`/issues/${encodeURIComponent(id)}/`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'resolved' }),
  });
}

export function formatIssues(issues) {
  if (!issues?.length) return '✅ No unresolved Sentry issues.';
  const lines = ['🐛 *Sentry issues* (unresolved)', ''];
  for (const it of issues.slice(0, 12)) {
    const id = it.shortId || it.id;
    const title = String(it.title || it.culprit || 'issue').slice(0, 80);
    const count = it.count != null ? it.count : '?';
    lines.push(`• \`${id}\` ×${count}`);
    lines.push(`  ${title}`);
  }
  lines.push('', '_Detail:_ `sentry issue <id>` · _Resolve:_ `sentry resolve <id>`');
  return lines.join('\n').slice(0, 3500);
}

export function formatIssueDetail(it) {
  if (!it) return 'Not found';
  return (
    `🐛 *${it.shortId || it.id}*\n` +
    `${String(it.title || '').slice(0, 200)}\n` +
    `Status: ${it.status}\n` +
    `Count: ${it.count ?? '?'} · Users: ${it.userCount ?? '?'}\n` +
    `Culprit: ${String(it.culprit || '').slice(0, 120)}\n` +
    `First: ${it.firstSeen || '?'} · Last: ${it.lastSeen || '?'}\n` +
    (it.permalink ? `Link: ${it.permalink}` : '')
  ).slice(0, 3500);
}

export default {
  sentryStatus,
  listIssues,
  getIssue,
  resolveIssue,
  formatIssues,
  formatIssueDetail,
};
