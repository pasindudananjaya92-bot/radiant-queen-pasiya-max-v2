/**
 * lib/chronos.js — Chronos Protocol (Time-Travel Defense)
 *
 * 1) Snapshot file SHA/content intent before dangerous writes
 * 2) Post-deploy health probe on production URL
 * 3) Auto-rollback file to previous GitHub commit blob on failure
 *
 * Free stack: GitHub API + fetch(/api/health). Vercel token optional for deploy list.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const PROD_BASE =
  process.env.CHRONOS_HEALTH_URL ||
  process.env.MINIAPP_URL ||
  'https://radiant-queen-pasiya-max-v2.vercel.app';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || '';

/** @type {Map<string, { path: string, sha: string, content: string, at: number, goal?: string }>} */
const lastSnapshots = new Map();

function ownerRepo() {
  const p = String(GITHUB_REPO).split('/');
  return { owner: p[0] || '', repo: p[1] || '' };
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pasiya-chronos',
  };
}

export async function githubGetFile(path) {
  const { owner, repo } = ownerRepo();
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const url =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    String(path).replace(/^\/+/, '');
  const res = await fetch(url, { headers: ghHeaders() });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: 'GET ' + res.status + ': ' + text.slice(0, 160) };
  const j = JSON.parse(text);
  const content = Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { ok: true, content, sha: j.sha, path: j.path };
}

export async function githubPutFile(path, content, message, sha) {
  const { owner, repo } = ownerRepo();
  const url =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    String(path).replace(/^\/+/, '');
  const body = {
    message: message || 'chronos rollback',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: 'PUT ' + res.status + ': ' + text.slice(0, 200) };
  let j = {};
  try {
    j = JSON.parse(text);
  } catch (_) {}
  return { ok: true, url: j.content?.html_url || j.commit?.html_url || '', path };
}

/** Save pre-change snapshot (memory + optional return for caller) */
export async function snapshotFile(path, meta = {}) {
  const got = await githubGetFile(path);
  if (!got.ok) return got;
  const snap = {
    path: String(path).replace(/^\/+/, ''),
    sha: got.sha,
    content: got.content,
    at: Date.now(),
    goal: meta.goal || '',
  };
  lastSnapshots.set(snap.path, snap);
  lastSnapshots.set('__last__', snap);
  return { ok: true, snapshot: { path: snap.path, sha: snap.sha, bytes: snap.content.length } };
}

export function getLastSnapshot(path) {
  if (path) return lastSnapshots.get(String(path).replace(/^\/+/, '')) || null;
  return lastSnapshots.get('__last__') || null;
}

/** Restore file to snapshot content (uses current SHA for PUT) */
export async function rollbackToSnapshot(path) {
  const key = path ? String(path).replace(/^\/+/, '') : null;
  const snap = key ? lastSnapshots.get(key) : lastSnapshots.get('__last__');
  if (!snap) return { ok: false, error: 'No snapshot in memory (serverless cold start?). Use /rollback commit instead.' };

  const current = await githubGetFile(snap.path);
  if (!current.ok) return current;
  // Already same?
  if (current.content === snap.content) {
    return { ok: true, note: 'already at snapshot content', path: snap.path };
  }
  const put = await githubPutFile(
    snap.path,
    snap.content,
    'chronos rollback: ' + snap.path + (snap.goal ? ' (' + snap.goal.slice(0, 40) + ')' : ''),
    current.sha
  );
  if (!put.ok) return put;
  return { ok: true, path: snap.path, url: put.url, restoredBytes: snap.content.length };
}

/** Restore file from N commits ago via GitHub commits API */
export async function rollbackFileFromHistory(path, commitsBack = 1) {
  const { owner, repo } = ownerRepo();
  const p = String(path).replace(/^\/+/, '');
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };

  const commitsUrl =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/commits?path=' +
    encodeURIComponent(p) +
    '&per_page=' +
    Math.min(10, commitsBack + 2);
  const cr = await fetch(commitsUrl, { headers: ghHeaders() });
  const commits = await cr.json();
  if (!cr.ok || !Array.isArray(commits) || commits.length < 2) {
    return { ok: false, error: 'Not enough commit history for ' + p };
  }
  const idx = Math.min(commitsBack, commits.length - 1);
  const targetSha = commits[idx].sha;
  // Get file at that commit
  const fileUrl =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    p +
    '?ref=' +
    targetSha;
  const fr = await fetch(fileUrl, { headers: ghHeaders() });
  const fj = await fr.json();
  if (!fr.ok) return { ok: false, error: 'history blob: ' + (fj.message || fr.status) };
  const content = Buffer.from(String(fj.content || '').replace(/\n/g, ''), 'base64').toString('utf8');

  const current = await githubGetFile(p);
  if (!current.ok) return current;
  const put = await githubPutFile(
    p,
    content,
    'chronos history rollback: ' + p + ' to ' + targetSha.slice(0, 7),
    current.sha
  );
  if (!put.ok) return put;
  return {
    ok: true,
    path: p,
    commit: targetSha.slice(0, 7),
    url: put.url,
    message: commits[idx].commit?.message?.split('\n')[0] || '',
  };
}

export async function checkProductionHealth(baseUrl) {
  const base = String(baseUrl || PROD_BASE).replace(/\/$/, '');
  const url = base + '/api/health';
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    const ms = Date.now() - started;
    const ok =
      res.ok &&
      json &&
      (json.ok === true || json.checks?.token === true || json.service);
    return {
      ok: !!ok,
      status: res.status,
      ms,
      url,
      body: json || text.slice(0, 200),
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), url, ms: Date.now() - started };
  }
}

/** Wait for deploy + health (best-effort on serverless) */
export async function waitHealthy(opts = {}) {
  const tries = opts.tries || 4;
  const delayMs = opts.delayMs || 8000;
  const results = [];
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const h = await checkProductionHealth(opts.baseUrl);
    results.push(h);
    if (h.ok) return { ok: true, tries: i + 1, health: h, results };
  }
  return { ok: false, tries, results, health: results[results.length - 1] };
}

/**
 * Protect a write: snapshot → run writeFn → optional health → rollback on fail
 * writeFn: async () => ({ ok, error?, ... })
 */
export async function guardedWrite({ path, goal, writeFn, healthCheck = true, onLog }) {
  const log = async (m) => {
    try {
      if (onLog) await onLog(m);
    } catch (_) {}
  };

  await log('Chronos snapshot ' + path + '…');
  const snap = await snapshotFile(path, { goal });
  if (!snap.ok) return { ok: false, error: 'snapshot failed: ' + snap.error, phase: 'snapshot' };

  await log('Applying change…');
  const written = await writeFn();
  if (!written || !written.ok) {
    return { ok: false, error: written?.error || 'write failed', phase: 'write', snapshot: snap.snapshot };
  }

  if (!healthCheck) {
    return { ok: true, written, snapshot: snap.snapshot, health: null, rolledBack: false };
  }

  await log('Waiting for health (Chronos)…');
  // Short wait — Vercel needs a moment after GitHub push
  const health = await waitHealthy({ tries: 3, delayMs: 7000 });
  if (health.ok) {
    return { ok: true, written, snapshot: snap.snapshot, health, rolledBack: false };
  }

  await log('Health FAILED — auto-rollback…');
  const rb = await rollbackToSnapshot(path);
  return {
    ok: false,
    error: 'Post-deploy health failed; rollback ' + (rb.ok ? 'OK' : rb.error),
    phase: 'health',
    health,
    rolledBack: !!rb.ok,
    rollback: rb,
    written,
  };
}

export async function listRecentCommits(path, limit = 5) {
  const { owner, repo } = ownerRepo();
  let url = 'https://api.github.com/repos/' + owner + '/' + repo + '/commits?per_page=' + limit;
  if (path) url += '&path=' + encodeURIComponent(String(path).replace(/^\/+/, ''));
  const res = await fetch(url, { headers: ghHeaders() });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || res.status };
  const items = (j || []).map((c) => ({
    sha: (c.sha || '').slice(0, 7),
    message: (c.commit?.message || '').split('\n')[0].slice(0, 80),
    date: c.commit?.author?.date || '',
  }));
  return { ok: true, commits: items };
}

export default {
  snapshotFile,
  getLastSnapshot,
  rollbackToSnapshot,
  rollbackFileFromHistory,
  checkProductionHealth,
  waitHealthy,
  guardedWrite,
  listRecentCommits,
};
