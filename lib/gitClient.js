/**
 * lib/gitClient.js — GitHub REST (free) for /git
 * Env: GITHUB_TOKEN, GITHUB_REPO (owner/name), GITHUB_BRANCH (default main)
 */
const API = 'https://api.github.com';

function cfg() {
  return {
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
    repo: process.env.GITHUB_REPO || process.env.GH_REPO || '',
    branch: process.env.GITHUB_BRANCH || process.env.GH_BRANCH || 'main',
  };
}

function headers(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RadiantQueen-DevBot',
  };
}

export async function gh(path, opts = {}) {
  const { token } = cfg();
  if (!token) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...headers(token), ...(opts.headers || {}) },
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
      error: json?.message || text.slice(0, 200),
    };
  }
  return { ok: true, data: json, status: res.status };
}

export async function gitStatus() {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing (owner/name)' };
  const [repoInfo, commits] = await Promise.all([
    gh('/repos/' + repo),
    gh('/repos/' + repo + '/commits?sha=' + encodeURIComponent(branch) + '&per_page=5'),
  ]);
  if (!repoInfo.ok) return repoInfo;
  return {
    ok: true,
    repo: repoInfo.data.full_name,
    default_branch: repoInfo.data.default_branch,
    branch,
    private: repoInfo.data.private,
    pushed_at: repoInfo.data.pushed_at,
    recent: (commits.data || []).map((c) => ({
      sha: c.sha?.slice(0, 7),
      msg: c.commit?.message?.split('\n')[0],
      at: c.commit?.author?.date,
    })),
  };
}

export async function gitBrowse(path = '') {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const p = String(path || '').replace(/^\/+/, '');
  const url =
    '/repos/' +
    repo +
    '/contents/' +
    (p ? encodeURIComponent(p).replace(/%2F/g, '/') : '') +
    '?ref=' +
    encodeURIComponent(branch);
  const r = await gh(url);
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
      encodeURIComponent(p).replace(/%2F/g, '/') +
      '?ref=' +
      encodeURIComponent(branch)
  );
  if (!r.ok) return r;
  if (r.data.encoding === 'base64' && r.data.content) {
    const content = Buffer.from(r.data.content, 'base64').toString('utf8');
    return {
      ok: true,
      path: r.data.path,
      sha: r.data.sha,
      content: content.slice(0, 120000),
      truncated: content.length > 120000,
    };
  }
  return { ok: false, error: 'not a text file or empty' };
}

export async function gitWrite(filePath, content, message) {
  const { repo, branch } = cfg();
  if (!repo) return { ok: false, error: 'GITHUB_REPO missing' };
  const p = String(filePath || '').replace(/^\/+/, '');
  // get current sha if exists
  const cur = await gitRead(p);
  const body = {
    message: message || 'update ' + p + ' via Radiant Queen /git',
    content: Buffer.from(String(content), 'utf8').toString('base64'),
    branch,
  };
  if (cur.ok && cur.sha) body.sha = cur.sha;
  const r = await gh('/repos/' + repo + '/contents/' + encodeURIComponent(p).replace(/%2F/g, '/'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  gh,
  gitStatus,
  gitBrowse,
  gitRead,
  gitWrite,
  gitLog,
  gitBranches,
  gitCreateBranch,
  gitCreatePr,
  cfg,
};
