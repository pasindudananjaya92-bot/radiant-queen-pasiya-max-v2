/**
 * lib/galaxyGod.js — Galaxy God Mode (fixed redeploy)
 * Redeploy: POST /v13/deployments { name, deploymentId }
 * Optional: VERCEL_DEPLOY_HOOK URL (Git Deploy Hook — most reliable)
 */
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || '';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const VERCEL_DEPLOY_HOOK = process.env.VERCEL_DEPLOY_HOOK || '';
const API = 'https://api.vercel.com';

function headers() {
  return {
    Authorization: 'Bearer ' + VERCEL_TOKEN,
    'Content-Type': 'application/json',
  };
}

function withTeam(url) {
  if (!VERCEL_TEAM_ID) return url;
  return url + (url.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(VERCEL_TEAM_ID);
}

export function vercelConfigured() {
  return Boolean(VERCEL_TOKEN || VERCEL_DEPLOY_HOOK);
}

export async function resolveProjectId(nameHint) {
  if (VERCEL_PROJECT_ID) return { ok: true, id: VERCEL_PROJECT_ID };
  if (!VERCEL_TOKEN) return { ok: false, error: 'VERCEL_TOKEN missing' };
  const res = await fetch(withTeam(API + '/v9/projects'), { headers: headers() });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.error?.message || res.status };
  const projects = j.projects || [];
  const hint = (nameHint || process.env.VERCEL_PROJECT_NAME || 'radiant-queen').toLowerCase();
  const hit =
    projects.find((p) => String(p.name || '').toLowerCase() === hint) ||
    projects.find((p) => String(p.name || '').toLowerCase().includes(hint)) ||
    projects[0];
  if (!hit) return { ok: false, error: 'No Vercel projects found' };
  return { ok: true, id: hit.id, name: hit.name };
}

export async function listDeployments(limit = 5) {
  const proj = await resolveProjectId();
  if (!proj.ok) return proj;
  let url = API + '/v6/deployments?projectId=' + encodeURIComponent(proj.id) + '&limit=' + limit;
  if (VERCEL_TEAM_ID) url += '&teamId=' + encodeURIComponent(VERCEL_TEAM_ID);
  const res = await fetch(url, { headers: headers() });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.error?.message || res.status };
  const items = (j.deployments || []).map((d) => ({
    uid: d.uid,
    url: d.url ? 'https://' + d.url : '',
    state: d.state || d.readyState,
    created: d.created ? new Date(d.created).toISOString() : '',
    name: d.name,
  }));
  return { ok: true, deployments: items, projectId: proj.id, projectName: proj.name || items[0]?.name };
}

/**
 * 1) Deploy Hook if set (simplest, always works)
 * 2) POST /v13/deployments { deploymentId, name, target: production }
 */
export async function triggerRedeploy() {
  // Path A: Deploy Hook
  if (VERCEL_DEPLOY_HOOK) {
    try {
      const res = await fetch(VERCEL_DEPLOY_HOOK, { method: 'POST' });
      let body = {};
      try {
        body = await res.json();
      } catch (_) {}
      if (res.ok || res.status === 201) {
        return {
          ok: true,
          method: 'deploy_hook',
          job: body.job || body,
          state: body.job?.state || 'PENDING',
          url: '',
        };
      }
      // continue to API path
    } catch (e) {
      /* fall through */
    }
  }

  if (!VERCEL_TOKEN) {
    return {
      ok: false,
      error: 'Need VERCEL_TOKEN or VERCEL_DEPLOY_HOOK',
      hint: 'Project → Settings → Git → Deploy Hooks → Create → paste as VERCEL_DEPLOY_HOOK',
    };
  }

  const list = await listDeployments(3);
  if (!list.ok) return list;
  const last = list.deployments?.[0];
  if (!last?.uid) return { ok: false, error: 'No prior deployment to redeploy from' };

  const name = list.projectName || last.name || 'radiant-queen-pasiya-max-v2';
  const url = withTeam(API + '/v13/deployments?forceNew=1');
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name,
      deploymentId: last.uid,
      target: 'production',
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error: j.error?.message || j.message || String(res.status),
      hint:
        'Create Deploy Hook in Vercel → Settings → Git → Deploy Hooks, set VERCEL_DEPLOY_HOOK, then /deploy now',
    };
  }
  return {
    ok: true,
    method: 'api_redeploy',
    uid: j.id || j.uid,
    url: j.url ? 'https://' + j.url : last.url,
    state: j.readyState || j.status || 'QUEUED',
  };
}

export async function listEnv(masked = true) {
  const proj = await resolveProjectId();
  if (!proj.ok) return proj;
  let url = API + '/v9/projects/' + proj.id + '/env';
  if (VERCEL_TEAM_ID) url += '?teamId=' + encodeURIComponent(VERCEL_TEAM_ID);
  const res = await fetch(url, { headers: headers() });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.error?.message || res.status };
  const envs = (j.envs || []).map((e) => ({
    key: e.key,
    type: e.type,
    target: (e.target || []).join(','),
    value: masked ? mask(e.value) : e.value,
    id: e.id,
  }));
  return { ok: true, envs, projectId: proj.id };
}

function mask(v) {
  const s = String(v || '');
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '****' + s.slice(-2);
}

export async function setEnv(key, value, targets = ['production', 'preview', 'development']) {
  const proj = await resolveProjectId();
  if (!proj.ok) return proj;
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return { ok: false, error: 'Key must be UPPER_SNAKE_CASE' };
  }
  let url = withTeam(API + '/v10/projects/' + proj.id + '/env');
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      key,
      value: String(value),
      type: 'encrypted',
      target: targets,
    }),
  });
  const j = await res.json();
  if (res.ok) return { ok: true, created: true, key };

  const listed = await listEnv(false);
  if (!listed.ok) return { ok: false, error: j.error?.message || 'create failed' };
  const hit = (listed.envs || []).find((e) => e.key === key);
  if (!hit?.id) return { ok: false, error: j.error?.message || 'env exists but id unknown' };

  let patchUrl = withTeam(API + '/v9/projects/' + proj.id + '/env/' + hit.id);
  const res2 = await fetch(patchUrl, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ value: String(value), type: 'encrypted', target: targets }),
  });
  const j2 = await res2.json();
  if (!res2.ok) return { ok: false, error: j2.error?.message || res2.status };
  return { ok: true, updated: true, key };
}

export function formatDeployments(list) {
  if (!list.ok) return '❌ ' + list.error;
  const lines = ['🚀 DEPLOYMENTS', 'Project: ' + (list.projectName || list.projectId), ''];
  for (const d of list.deployments || []) {
    lines.push('• ' + (d.state || '?') + ' · ' + (d.created || '').slice(0, 19));
    if (d.url) lines.push('  ' + d.url);
  }
  return lines.join('\n');
}

export function formatEnvs(list) {
  if (!list.ok) return '❌ ' + list.error;
  const lines = ['🔐 ENV (masked)', ''];
  for (const e of list.envs || []) {
    lines.push('• ' + e.key + ' = ' + e.value + (e.target ? ' [' + e.target + ']' : ''));
  }
  if (!(list.envs || []).length) lines.push('(none listed)');
  lines.push('', 'Set: /env set KEY=value', 'Redeploy: /deploy now');
  return lines.join('\n').slice(0, 3500);
}

export default {
  vercelConfigured,
  resolveProjectId,
  listDeployments,
  triggerRedeploy,
  listEnv,
  setEnv,
  formatDeployments,
  formatEnvs,
};
