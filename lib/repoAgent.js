/**
 * repoAgent.js — Agent-11/12 Multi-Repo
 * - list / switch / status (active never prints [object Object])
 * - write with safety confirm gate (Agent-12)
 */
'use strict';

function parseList() {
  const primary = String(process.env.GITHUB_REPO || '').trim();
  const extra = String(process.env.MULTI_REPOS || process.env.GITHUB_REPOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [];
  if (primary) all.push(primary);
  extra.forEach((r) => {
    if (r && all.indexOf(r) === -1) all.push(r);
  });
  return all;
}

/** Normalize anything bridge returns into "owner/name" string */
export function normalizeRepoRef(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const s = v.trim();
    // JSON string?
    if (s.startsWith('{') && s.includes('full_name')) {
      try {
        return normalizeRepoRef(JSON.parse(s));
      } catch (_) {
        return s;
      }
    }
    return s;
  }
  if (typeof v === 'object') {
    return (
      v.full_name ||
      v.fullName ||
      v.repo ||
      v.name ||
      (v.owner && v.repo
        ? String(v.owner) + '/' + String(v.repo)
        : v.owner && v.name
          ? String(v.owner.login || v.owner) + '/' + String(v.name)
          : '') ||
      ''
    );
  }
  return String(v);
}

async function getActiveRepo() {
  let active = String(process.env.GITHUB_REPO || '').trim();
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.getActiveRepo === 'function') {
      const a = await bridge.getActiveRepo();
      const n = normalizeRepoRef(a);
      if (n) active = n;
    }
  } catch (_) {}
  return normalizeRepoRef(active);
}

export async function listRepos() {
  const active = await getActiveRepo();
  const repos = parseList();
  if (!repos.length && !active) {
    return (
      'No repos configured.\n' +
      'Set GITHUB_REPO=owner/name\n' +
      'Optional MULTI_REPOS=owner/a,owner/b'
    );
  }
  const lines = ['📦 REPOS · active: ' + (active || '—'), ''];
  const seen = new Set();
  if (active) seen.add(active);
  repos.forEach((r) => seen.add(r));
  let i = 0;
  seen.forEach((r) => {
    i++;
    lines.push(i + '. ' + r + (r === active ? '  ← active' : ''));
  });
  lines.push('', 'switch repo owner/name');
  lines.push('repo write path | content   (queues confirm)');
  return lines.join('\n');
}

export async function switchRepo(name) {
  const target = normalizeRepoRef(
    String(name || '')
      .trim()
      .replace(/^switch\s+repo\s+/i, '')
  );
  if (!target || !target.includes('/')) {
    return 'Usage: switch repo owner/name';
  }
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.setActiveRepo === 'function') {
      await bridge.setActiveRepo(target);
      return '✅ Active repo → ' + target;
    }
  } catch (_) {}
  return (
    '⚠ repoBridge.setActiveRepo not available.\n' +
    'Set Vercel env GITHUB_REPO=' +
    target +
    ' and redeploy.\n' +
    '(Runtime switch needs repoBridge + bot_config)'
  );
}

export async function repoStatus() {
  const active = await getActiveRepo();
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.status === 'function') {
      const s = await bridge.status();
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') {
        return (
          '📦 REPO STATUS\n' +
          'active: ' +
          normalizeRepoRef(s.active || s.repo || s.full_name || active) +
          '\n' +
          JSON.stringify(s).slice(0, 1500)
        );
      }
    }
  } catch (_) {}
  return (
    '📦 REPO STATUS\n' +
    'active: ' +
    (active || '—') +
    '\nGITHUB_REPO: ' +
    normalizeRepoRef(process.env.GITHUB_REPO) +
    '\nMULTI_REPOS: ' +
    (process.env.MULTI_REPOS || process.env.GITHUB_REPOS || '—') +
    '\nToken: ' +
    (process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? 'yes' : 'no')
  );
}

/** GitHub Contents API put */
async function ghPut({ repo, path, content, message }) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) throw new Error('GITHUB_TOKEN missing');
  const [owner, name] = String(repo).split('/');
  if (!owner || !name) throw new Error('bad repo');
  const api =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    name +
    '/contents/' +
    String(path).replace(/^\//, '');
  // get sha if exists
  let sha;
  try {
    const gr = await fetch(api, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PasiyaOS-RepoAgent',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (gr.ok) {
      const j = await gr.json();
      sha = j.sha;
    }
  } catch (_) {}
  const body = {
    message: message || 'chore: pasiya repo write ' + path,
    content: Buffer.from(String(content), 'utf8').toString('base64'),
  };
  if (sha) body.sha = sha;
  const res = await fetch(api, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PasiyaOS-RepoAgent',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(j.message || 'GitHub HTTP ' + res.status);
  }
  return {
    ok: true,
    path: path,
    repo: repo,
    commit: j.commit && j.commit.sha,
    html: j.content && j.content.html_url,
  };
}

const DENY = [
  /^api\/telegram\.js$/i,
  /^package\.json$/i,
  /^\.env/i,
  /vercel\.json$/i,
];

export function isDeniedPath(path) {
  const p = String(path || '').replace(/^\//, '');
  return DENY.some((re) => re.test(p));
}

/** Queue write for confirm — does not push yet */
export async function queueRepoWrite({ path, content, repo, userId }) {
  const active = repo || (await getActiveRepo());
  const filePath = String(path || '').replace(/^\//, '');
  if (!filePath) return 'Usage: repo write path/to/file.js | file contents here';
  if (isDeniedPath(filePath)) {
    return '🛡 Blocked path (safety gate): ' + filePath;
  }
  if (!active) return 'No active repo. switch repo owner/name first.';

  // store pending via agentPending if available
  try {
    const ap = await import('./agentPending.js');
    if (typeof ap.setPendingAction === 'function') {
      await ap.setPendingAction(userId, 'repo_write', {
        repo: active,
        path: filePath,
        content: String(content || '').slice(0, 200000),
      });
      return (
        '⏸ CONFIRM GATE · repo write\n' +
        'repo: ' +
        active +
        '\npath: ' +
        filePath +
        '\nbytes: ' +
        String(content || '').length +
        '\n\nconfirm repo write\ncancel'
      );
    }
  } catch (_) {}

  return (
    '⏸ Confirm required but pending store unavailable.\n' +
    'repo: ' +
    active +
    ' path: ' +
    filePath +
    '\nReply: confirm repo write (wire agentPending) or use /debug apply flow.'
  );
}

export async function applyRepoWrite(payload) {
  const repo = normalizeRepoRef(payload.repo);
  const path = String(payload.path || '').replace(/^\//, '');
  const content = payload.content || '';
  if (isDeniedPath(path)) throw new Error('Blocked path: ' + path);
  return await ghPut({
    repo: repo,
    path: path,
    content: content,
    message: 'chore(pasiya): repo write ' + path,
  });
}

export default {
  listRepos,
  switchRepo,
  repoStatus,
  normalizeRepoRef,
  queueRepoWrite,
  applyRepoWrite,
  isDeniedPath,
  getActiveRepo,
};
