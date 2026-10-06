/**
 * lib/gitClient.js — GitHub REST ONLY (no git CLI)
 * Fixes: normalize GITHUB_REPO, clearer 404 errors, whoami
 */
const API = 'https://api.github.com';

function normalizeRepo(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^https?:\/\/github\.com\//i, '');
  s = s.replace(/\.git$/i, '');
  s = s.replace(/^github\.com\//i, '');
  s = s.replace(/\/+$/, '');
  // owner/repo only
  const m = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m) return s;
  return m[1] + '/' + m[2];
}

export function cfg() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  const repo = normalizeRepo(process.env.GITHUB_REPO || process.env.GH_REPO || '');
  const branch = (process.env.GITHUB_BRANCH || process.env.GH_BRANCH || 'main').trim();
  return { token, repo, branch };
}

function headers(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RadiantQueen-DevBot/4.0',
  };
}

export async function gh(path, opts = {}) {
  const { token } = cfg();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN missing', code: 'NO_TOKEN' };
  }
  const url = path.startsWith('http') ? path : API + path;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { ...headers(token), ...(opts.headers || {}) },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json?.message || text.slice(0, 200) || 'HTTP ' + res.status,
        path,
        doc: json?.documentation_url,
      };
    }
    return { ok: true, data: json, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e.message || e), path };
  }
}

export async function gitWhoami() {
  const r = await gh('/user');
  if (!r.ok) return r;
  return {
    ok: true,
    login: r.data.login,
    id: r.data.id,
    name: r.data.name,
  };
}

export async function gitStatus() {
  const { repo, branch, token } = cfg();
  if (!token) return { ok: false, error: 'GITHUB_TOKEN missing — add in Vercel env' };
  if (!repo || !repo.includes('/')) {
    return {
      ok: false,
      error: 'GITHUB_REPO must be owner/name (got: ' + (repo || 'empty') + ')',
    };
  }
  const repoInfo = await gh('/repos/' + repo);
  if (!repoInfo.ok) {
    return {
      ok: false,
      error:
        'Repo API: ' +
        repoInfo.error +
        ' (HTTP ' +
        (repoInfo.status || '?') +
        ')\nrepo=' +
        repo +
        '\nCheck: token access to this repo, name spelling, private repo permissions (repo scope)',
      status: repoInfo.status,
    };
  }
  const commits = await gh(
    '/repos/' + repo + '/commits?sha=' + encodeURIComponent(branch) + '&per_page=5'
  );
  return {
    ok: true,
    repo: repoInfo.data.full_name,
    default_branch: repoInfo.data.default_branch,
    branch,
    private: repoInfo.data.private,
    pushed_at: repoInfo.data.pushed_at,
    permissions: repoInfo.data.permissions,
    recent: commits.ok
      ? (commits.data || []).map((c) => ({
          sha: c.sha?.slice(0, 7),
          msg: c.commit?.message?.split('\n')[0],
          at: c.commit?.author?.date,
        }))
      : [],
    commits_error: commits.ok ? null : commits.error,
  };
}

export async function gitBrowse(path = '') {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const p = String(path || '').replace(/^\/+/, '');
  const contentPath = p
    ? '/repos/' + repo + '/contents/' + p.split('/').map(encodeURIComponent).join('/')
    : '/repos/' + repo + '/contents';
  const r = await gh(contentPath + '?ref=' + encodeURIComponent(branch));
  if (!r.ok) return r;
  if (Array.isArray(r.data)) {
    return {
      ok: true,
      type: 'dir',
      path: p || '/',
      entries: r.data.map((e) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        path: e.path,
      })),
    };
  }
  return {
    ok: true,
    type: 'file',
    path: r.data.path,
    size: r.data.size,
    sha: r.data.sha,
  };
}

export async function gitRead(filePath) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const p = String(filePath || '').replace(/^\/+/, '');
  const r = await gh(
    '/repos/' +
      repo +
      '/contents/' +
      p.split('/').map(encodeURIComponent).join('/') +
      '?ref=' +
      encodeURIComponent(branch)
  );
  if (!r.ok) return r;
  if (r.data.type !== 'file') return { ok: false, error: 'not a file' };
  if (r.data.encoding === 'base64' && r.data.content) {
    const content = Buffer.from(r.data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    return {
      ok: true,
      path: r.data.path,
      sha: r.data.sha,
      content: content.slice(0, 120000),
      truncated: content.length > 120000,
    };
  }
  return { ok: false, error: 'empty or binary file' };
}

export async function gitWrite(filePath, content, message) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const p = String(filePath || '').replace(/^\/+/, '');
  const cur = await gitRead(p);
  const body = {
    message: message || 'update ' + p + ' via Radiant Queen /git',
    content: Buffer.from(String(content), 'utf8').toString('base64'),
    branch,
  };
  if (cur.ok && cur.sha) body.sha = cur.sha;
  const r = await gh(
    '/repos/' + repo + '/contents/' + p.split('/').map(encodeURIComponent).join('/'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) return r;
  return {
    ok: true,
    path: p,
    commit: r.data.commit?.sha?.slice(0, 7),
    url: r.data.content?.html_url,
  };
}

export async function gitLog(limit = 8) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const r = await gh(
    '/repos/' +
      repo +
      '/commits?sha=' +
      encodeURIComponent(branch) +
      '&per_page=' +
      Math.min(20, limit)
  );
  if (!r.ok) return r;
  return {
    ok: true,
    commits: (r.data || []).map((c) => ({
      sha: c.sha.slice(0, 7),
      msg: c.commit.message.split('\n')[0].slice(0, 120),
      author: c.commit.author?.name,
      at: c.commit.author?.date,
    })),
  };
}

export async function gitBranches() {
  const { repo } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const r = await gh('/repos/' + repo + '/branches?per_page=30');
  if (!r.ok) return r;
  return {
    ok: true,
    branches: (r.data || []).map((b) => ({ name: b.name, protected: b.protected })),
  };
}

export async function gitCreateBranch(name, from) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const base = from || branch;
  const ref = await gh('/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(base));
  if (!ref.ok) return ref;
  const sha = ref.data.object?.sha;
  const r = await gh('/repos/' + repo + '/git/refs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/' + name, sha }),
  });
  if (!r.ok) return r;
  return { ok: true, branch: name, sha: sha?.slice(0, 7) };
}

export async function gitCompare(base, head) {
  const { repo } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const r = await gh(
    '/repos/' + repo + '/compare/' + encodeURIComponent(base) + '...' + encodeURIComponent(head)
  );
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.data.status,
    ahead: r.data.ahead_by,
    behind: r.data.behind_by,
    total_commits: r.data.total_commits,
    files: (r.data.files || []).slice(0, 30).map((f) => ({
      filename: f.filename,
      status: f.status,
      changes: f.changes,
    })),
  };
}

export async function gitCreatePr(title, head, base, body) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const r = await gh('/repos/' + repo + '/pulls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title || 'PR from Radiant Queen',
      head: head || branch,
      base: base || 'main',
      body: body || 'Opened via /git pr',
    }),
  });
  if (!r.ok) return r;
  return { ok: true, number: r.data.number, url: r.data.html_url };
}

export default {
  cfg,
  gh,
  gitWhoami,
  gitStatus,
  gitBrowse,
  gitRead,
  gitWrite,
  gitLog,
  gitBranches,
  gitCreateBranch,
  gitCompare,
  gitCreatePr,
};
