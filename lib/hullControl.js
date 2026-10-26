/**
 * Hull Control — multi-Vercel project orchestration (founder-only)
 * Create / list projects, register Hull B, set env (double-confirm), trigger deploy.
 * Uses VERCEL_TOKEN (or VERCEL_ACCESS_TOKEN). Optional VERCEL_TEAM_ID.
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function token() {
  return (
    process.env.VERCEL_TOKEN ||
    process.env.VERCEL_ACCESS_TOKEN ||
    process.env.VERCEL_API_TOKEN ||
    ''
  ).trim();
}

function teamId() {
  return (process.env.VERCEL_TEAM_ID || '').trim();
}

function projectId() {
  return (process.env.VERCEL_PROJECT_ID || '').trim();
}

function apiBase() {
  return 'https://api.vercel.com';
}

async function vercel(path, opts = {}) {
  const t = token();
  if (!t) throw new Error('Set VERCEL_TOKEN in Vercel env');
  const team = teamId();
  const url =
    apiBase() +
    path +
    (team ? (path.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(team) : '');
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + t,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg =
      (json && (json.error?.message || json.message || json.raw)) ||
      'HTTP ' + res.status;
    throw new Error(String(msg).slice(0, 280));
  }
  return json;
}

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbRest(path, opts = {}) {
  const s = sb();
  if (!s) return null;
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body,
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

export async function listProjects(limit = 15) {
  const data = await vercel('/v9/projects?limit=' + Math.min(50, limit));
  const projects = data.projects || data || [];
  return Array.isArray(projects) ? projects : [];
}

export async function getProject(id) {
  return vercel('/v9/projects/' + encodeURIComponent(id));
}

/**
 * Create a new Vercel project (Hull B / worker).
 * name: slug-safe
 * framework: null = other
 * gitRepo: optional "owner/repo"
 */
export async function createProject({ name, gitRepo = '', framework = null }) {
  const body = {
    name: String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48),
    framework: framework,
  };
  if (!body.name) throw new Error('Project name required');
  if (gitRepo) {
    body.gitRepository = {
      type: 'github',
      repo: gitRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''),
    };
  }
  const created = await vercel('/v10/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // Register in Supabase
  try {
    await sbRest('rq_hull_registry', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        name: body.name,
        vercel_project_id: created.id || created.project?.id || null,
        vercel_project_name: created.name || body.name,
        role: 'worker',
        github_repo: gitRepo || process.env.GITHUB_REPO || null,
        status: 'active',
        meta: { source: 'hull-control' },
      }),
    });
  } catch (_) {}
  return created;
}

export async function listEnv(projectId) {
  const pid = projectId || process.env.VERCEL_PROJECT_ID;
  if (!pid) throw new Error('VERCEL_PROJECT_ID missing');
  const data = await vercel(
    '/v9/projects/' + encodeURIComponent(pid) + '/env'
  );
  const envs = data.envs || data || [];
  return Array.isArray(envs) ? envs : [];
}

/** Mask secrets for display */
export function formatEnvList(envs) {
  if (!envs.length) return 'No env vars found.';
  return envs
    .slice(0, 40)
    .map((e) => {
      const key = e.key || e.name || '?';
      const target = Array.isArray(e.target) ? e.target.join('+') : e.target || '';
      return '• `' + key + '` · ' + (e.type || 'plain') + (target ? ' · ' + target : '');
    })
    .join('\n');
}

/**
 * Create env var — requires confirm token in command flow
 * target: production | preview | development
 */
export async function setEnv({
  projectId,
  key,
  value,
  targets = ['production', 'preview', 'development'],
  type = 'encrypted',
}) {
  const pid = projectId || process.env.VERCEL_PROJECT_ID;
  if (!pid) throw new Error('VERCEL_PROJECT_ID missing');
  if (!key || value === undefined) throw new Error('key and value required');
  return vercel('/v10/projects/' + encodeURIComponent(pid) + '/env', {
    method: 'POST',
    body: JSON.stringify({
      key: String(key).trim(),
      value: String(value),
      type,
      target: targets,
    }),
  });
}

/** Trigger redeploy via Deploy Hook URL (preferred free path) */
export async function triggerDeployHook(hookUrl) {
  const url = hookUrl || process.env.VERCEL_DEPLOY_HOOK || '';
  if (!url) throw new Error('Set VERCEL_DEPLOY_HOOK or pass hook URL');
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  if (!res.ok) throw new Error('Deploy hook HTTP ' + res.status + ' ' + text.slice(0, 120));
  return { ok: true, status: res.status, body: text.slice(0, 200) };
}

export async function listHullRegistry() {
  const rows = await sbRest(
    'rq_hull_registry?order=created_at.desc&limit=20&select=*'
  );
  return Array.isArray(rows) ? rows : [];
}

export function formatProjects(projects) {
  if (!projects.length) return 'No projects.';
  return projects
    .slice(0, 15)
    .map((p, i) => {
      const id = String(p.id || '').slice(0, 12);
      return (
        i +
        1 +
        '. **' +
        (p.name || '?') +
        '**\n   id=`' +
        id +
        '` · ' +
        (p.framework || 'other') +
        (p.link?.repo ? ' · ' + p.link.repo : '')
      );
    })
    .join('\n');
}

export function formatHullRegistry(rows) {
  if (!rows.length) return 'No hulls registered yet. Use /hull create <name>';
  return rows
    .map((r, i) => {
      return (
        i +
        1 +
        '. **' +
        r.name +
        '** · ' +
        (r.role || 'worker') +
        '\n   vercel=`' +
        String(r.vercel_project_id || '').slice(0, 12) +
        '` · ' +
        (r.status || '')
      );
    })
    .join('\n');
}

// In-memory confirm for env-set (serverless: short-lived; use confirm token in message)
const pendingEnv = new Map();

export async function handleHullCmd(text, ctx) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const body = raw.replace(/^\/hull\s*/i, '').trim();
  const [action, ...rest] = body.split(/\s+/);
  const a = (action || 'help').toLowerCase();
  const arg = rest.join(' ').trim();

  if (a === 'help' || !action) {
    return (
      '🛰 HULL CONTROL (multi-project)\n\n' +
      '/hull status — this project + token\n' +
      '/hull list — Vercel projects\n' +
      '/hull registry — Supabase hull table\n' +
      '/hull create <name> — new Vercel project (Hull B)\n' +
      '/hull create <name> repo:owner/repo — link GitHub\n' +
      '/hull env — list env keys (masked)\n' +
      '/hull env-set KEY=VALUE :: confirm\n' +
      '/hull deploy — trigger VERCEL_DEPLOY_HOOK\n\n' +
      'Env needed: VERCEL_TOKEN, VERCEL_PROJECT_ID\n' +
      'Optional: VERCEL_TEAM_ID, VERCEL_DEPLOY_HOOK'
    );
  }

  if (a === 'status') {
    return (
      '🛰 HULL STATUS\n' +
      'Token: ' +
      (token() ? '✅' : '❌') +
      '\nProject ID: ' +
      (projectId() || '❌') +
      '\nTeam: ' +
      (teamId() || '(personal)') +
      '\nDeploy hook: ' +
      (process.env.VERCEL_DEPLOY_HOOK ? '✅' : '—') +
      '\nRepo: ' +
      (process.env.GITHUB_REPO || '—')
    );
  }

  if (a === 'list') {
    const projects = await listProjects(20);
    return '🛰 VERCEL PROJECTS\n' + formatProjects(projects);
  }

  if (a === 'registry') {
    const rows = await listHullRegistry();
    return '🛰 HULL REGISTRY\n' + formatHullRegistry(rows);
  }

  if (a === 'create') {
    let name = arg;
    let gitRepo = '';
    const m = arg.match(/^(.*?)\s+repo:(\S+)/i);
    if (m) {
      name = m[1].trim();
      gitRepo = m[2].trim();
    }
    if (!name) return 'Usage: /hull create my-worker-bot\nOr: /hull create my-worker repo:owner/name';
    const created = await createProject({ name, gitRepo });
    const id = created.id || created.project?.id || '?';
    const n = created.name || name;
    return (
      '✅ Hull project created\n' +
      'Name: **' +
      n +
      '**\n' +
      'ID: `' +
      id +
      '`\n\n' +
      'Next:\n' +
      '1. Vercel dashboard → Project → Settings → Git (if not linked)\n' +
      '2. Copy env from Hull A (BOT_TOKEN optional for pure worker)\n' +
      '3. /hull registry to verify Supabase row\n' +
      '4. Set Deploy Hook → /hull deploy (on that project later)'
    );
  }

  if (a === 'env') {
    const envs = await listEnv(projectId());
    return '🔐 ENV (keys only)\n' + formatEnvList(envs);
  }

  if (a === 'env-set') {
    // /hull env-set KEY=VALUE :: confirm
    if (!/::\s*confirm\s*$/i.test(arg)) {
      return (
        '⚠️ Double-confirm required.\n' +
        'Usage:\n`/hull env-set MY_KEY=my_value :: confirm`\n' +
        'Only founder. Value is sent to Vercel API (encrypted).'
      );
    }
    const payload = arg.replace(/::\s*confirm\s*$/i, '').trim();
    const eq = payload.indexOf('=');
    if (eq < 1) return 'Need KEY=VALUE';
    const key = payload.slice(0, eq).trim();
    const value = payload.slice(eq + 1).trim();
    await setEnv({ key, value });
    return '✅ Env set: `' + key + '` (production+preview+development)\nRedeploy may be required.';
  }

  if (a === 'deploy') {
    const r = await triggerDeployHook();
    return '🚀 Deploy hook fired · HTTP ' + r.status;
  }

  return 'Unknown /hull action. Try /hull help';
}

export default {
  listProjects,
  createProject,
  listEnv,
  setEnv,
  triggerDeployHook,
  handleHullCmd,
};
