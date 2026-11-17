/**
 * Deploy Guardian · 23B
 * - Lists api/*.js for Vercel Hobby 12-function budget
 * - Never trusts a single GitHub call: contents → tree → fallback catalog
 * - Invalid/missing GITHUB_TOKEN must not force 404 / zero count
 */

const HOBBY_FN_MAX = 12;

/** Known production serverless entry files (update when you add api routes) */
const FALLBACK_API_JS = [
  'cron.js',
  'dash.js',
  'fs.js',
  'site.js',
  'telegram.js',
];

function ghHeaders(useToken = true) {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'QueenOS-DeployGuardian/23B',
  };
  if (useToken) {
    const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || '';
    if (tok) h.Authorization = 'Bearer ' + tok;
  }
  return h;
}

function repoParts() {
  return {
    owner: process.env.GITHUB_OWNER || process.env.GH_OWNER || 'pasindudananjaya92-bot',
    repo: process.env.GITHUB_REPO || process.env.GH_REPO || 'radiant-queen-pasiya-max-v2',
    branch: process.env.GITHUB_BRANCH || process.env.GH_BRANCH || 'main',
  };
}

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { raw: text.slice(0, 200) };
  }
  return { ok: r.ok, status: r.status, data };
}

function isServerlessName(name) {
  return /\.(js|mjs|ts)$/i.test(name || '') && !/upload|readme|instruction/i.test(name || '');
}

async function listApiViaContents(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/api?ref=${encodeURIComponent(branch)}`;
  // Try WITHOUT token first (public repo). Bad tokens often cause weird 404s.
  let res = await fetchJson(url, ghHeaders(false));
  if (!res.ok) res = await fetchJson(url, ghHeaders(true));
  if (!res.ok) {
    return { files: [], error: `contents ${res.status}`, method: 'contents' };
  }
  const arr = Array.isArray(res.data) ? res.data : [];
  const files = arr
    .filter((f) => f && f.type === 'file' && isServerlessName(f.name))
    .map((f) => f.name)
    .sort();
  return { files, error: null, method: 'contents' };
}

async function listApiViaTree(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  let res = await fetchJson(url, ghHeaders(false));
  if (!res.ok) res = await fetchJson(url, ghHeaders(true));
  if (!res.ok) {
    return { files: [], error: `tree ${res.status}`, method: 'tree' };
  }
  const tree = res.data?.tree || [];
  const files = tree
    .filter((t) => t.type === 'blob' && /^api\/[^/]+\.(js|mjs|ts)$/i.test(t.path || ''))
    .map((t) => t.path.replace(/^api\//, ''))
    .filter(isServerlessName)
    .sort();
  return { files, error: null, method: 'tree' };
}

async function listApiFiles() {
  const { owner, repo, branch } = repoParts();
  const attempts = [];

  try {
    const a = await listApiViaContents(owner, repo, branch);
    attempts.push(a.method + (a.error ? ':' + a.error : ':' + a.files.length));
    if (a.files.length) return { files: a.files, method: a.method, attempts, fallback: false };
  } catch (e) {
    attempts.push('contents:ex:' + (e.message || e));
  }

  try {
    const b = await listApiViaTree(owner, repo, branch);
    attempts.push(b.method + (b.error ? ':' + b.error : ':' + b.files.length));
    if (b.files.length) return { files: b.files, method: b.method, attempts, fallback: false };
  } catch (e) {
    attempts.push('tree:ex:' + (e.message || e));
  }

  // Hard fallback — never report 0 when we know production layout
  return {
    files: FALLBACK_API_JS.slice(),
    method: 'fallback_catalog',
    attempts,
    fallback: true,
    note: 'GitHub list failed — using known api/*.js catalog. Set public repo or valid GITHUB_TOKEN.',
  };
}

export async function runDeployCheck() {
  const t0 = Date.now();
  const alerts = [];
  const { owner, repo, branch } = repoParts();

  const listed = await listApiFiles();
  const apiFiles = listed.files || [];
  const total = apiFiles.length;

  if (listed.fallback) {
    alerts.push({
      level: 'yellow',
      msg: listed.note || 'Using fallback api catalog (GitHub list failed)',
    });
    alerts.push({
      level: 'yellow',
      msg: 'Attempts: ' + (listed.attempts || []).join(' · '),
    });
  }

  if (total > HOBBY_FN_MAX) {
    alerts.push({
      level: 'red',
      msg: `Functions ${total} > Hobby max ${HOBBY_FN_MAX} — consolidate api/*.js`,
    });
  } else if (total >= HOBBY_FN_MAX - 1) {
    alerts.push({
      level: 'yellow',
      msg: `Function budget tight: ${total}/${HOBBY_FN_MAX}`,
    });
  }

  // Vercel optional
  const token = process.env.VERCEL_TOKEN || '';
  let vercel = { configured: !!token, latest: null };
  if (token) {
    try {
      let url = 'https://api.vercel.com/v6/deployments?limit=2&target=production';
      if (process.env.VERCEL_PROJECT_ID) url += '&projectId=' + encodeURIComponent(process.env.VERCEL_PROJECT_ID);
      if (process.env.VERCEL_TEAM_ID) url += '&teamId=' + encodeURIComponent(process.env.VERCEL_TEAM_ID);
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) {
        const data = await r.json();
        const d = (data.deployments || [])[0];
        if (d) {
          vercel.latest = {
            state: d.state || d.readyState || 'unknown',
            url: d.url || '',
            errorMessage: d.errorMessage || null,
          };
          if (/ERROR|FAILED/i.test(String(vercel.latest.state))) {
            alerts.push({
              level: 'red',
              msg: 'Vercel ' + vercel.latest.state + (vercel.latest.errorMessage ? ': ' + vercel.latest.errorMessage : ''),
            });
          }
        }
      } else {
        alerts.push({ level: 'yellow', msg: 'Vercel API HTTP ' + r.status });
      }
    } catch (e) {
      alerts.push({ level: 'yellow', msg: 'Vercel: ' + (e.message || e) });
    }
  } else {
    alerts.push({
      level: 'yellow',
      msg: 'VERCEL_TOKEN not set — deploy state optional. Function count still works.',
    });
  }

  const red = alerts.some((a) => a.level === 'red');
  return {
    ok: !red,
    ms: Date.now() - t0,
    hobby_fn_max: HOBBY_FN_MAX,
    api_files: apiFiles,
    api_count: total,
    total_estimate: total,
    list_method: listed.method,
    list_fallback: !!listed.fallback,
    repo: `${owner}/${repo}@${branch}`,
    vercel,
    alerts,
  };
}

export function formatDeployCheck(r) {
  const lines = [
    '🛡 *Deploy Guardian · 23B*',
    r.ok ? '✅ No RED risks' : '🚨 Action needed',
    '',
    `Repo: \`${r.repo}\``,
    `Functions: *${r.total_estimate}* / ${r.hobby_fn_max} Hobby`,
    `api/*.js (${r.list_method}): ${(r.api_files || []).join(', ') || '—'}`,
  ];
  if (r.vercel?.latest) {
    lines.push(`Vercel: *${r.vercel.latest.state}* · ${r.vercel.latest.url || ''}`);
  } else if (!r.vercel?.configured) {
    lines.push('Vercel token: not set (optional)');
  }
  if ((r.alerts || []).length) {
    lines.push('');
    lines.push('*Alerts*');
    for (const a of r.alerts) {
      lines.push((a.level === 'red' ? '🔴 ' : '🟡 ') + a.msg);
    }
  }
  lines.push('');
  lines.push('_' + r.ms + 'ms_');
  return lines.join('\n');
}

export async function deployGuardianBrief() {
  const r = await runDeployCheck();
  const red = (r.alerts || []).filter((a) => a.level === 'red');
  if (red.length) return `🛡 Deploy RED · ${red[0].msg}`;
  return `🛡 Deploy OK · fn ${r.total_estimate}/${r.hobby_fn_max} · ${r.list_method}`;
}

export function deployHelp() {
  return [
    '*Deploy Guardian · 23B*',
    '• `deploy check` / `deploy status` — Hobby function budget + Vercel',
    '• `deploy help` — this menu',
    '',
    'Counts only `api/*.js` serverless files (Hobby max 12).',
    'If GitHub list fails → uses safe fallback catalog (never false 0).',
    'Optional env: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `GITHUB_TOKEN`',
  ].join('\n');
}

export default {
  runDeployCheck,
  formatDeployCheck,
  deployGuardianBrief,
  deployHelp,
};
