/**
 * lib/vercelClient.js — Vercel REST API
 * Env: VERCEL_TOKEN, VERCEL_PROJECT_ID or VERCEL_PROJECT_NAME, VERCEL_TEAM_ID (optional)
 */
const API = 'https://api.vercel.com';

function cfg() {
  return {
    token: process.env.VERCEL_TOKEN || '',
    projectId: process.env.VERCEL_PROJECT_ID || '',
    projectName: process.env.VERCEL_PROJECT_NAME || '',
    teamId: process.env.VERCEL_TEAM_ID || '',
  };
}

function qs(extra = {}) {
  const { teamId } = cfg();
  const p = new URLSearchParams(extra);
  if (teamId) p.set('teamId', teamId);
  const s = p.toString();
  return s ? '?' + s : '';
}

export async function vercel(path, opts = {}) {
  const { token } = cfg();
  if (!token) return { ok: false, error: 'VERCEL_TOKEN missing' };
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(opts.timeoutMs || 30000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.error?.message || text.slice(0, 200) };
  }
  return { ok: true, data: json };
}

export async function listDeployments(limit = 8) {
  const { projectId, projectName } = cfg();
  const extra = { limit: String(limit) };
  if (projectId) extra.projectId = projectId;
  else if (projectName) extra.app = projectName;
  const r = await vercel('/v6/deployments' + qs(extra));
  if (!r.ok) return r;
  const list = r.data.deployments || r.data || [];
  return {
    ok: true,
    deployments: list.slice(0, limit).map((d) => ({
      id: d.uid || d.id,
      url: d.url,
      state: d.state || d.readyState,
      created: d.created ? new Date(d.created).toISOString() : d.createdAt,
      meta: d.meta?.githubCommitMessage || d.name,
    })),
  };
}

export async function redeploy(deploymentId) {
  // Vercel: POST /v13/deployments with deploymentId to redeploy
  const body = deploymentId
    ? { deploymentId, name: cfg().projectName || undefined }
    : { name: cfg().projectName };
  const r = await vercel('/v13/deployments' + qs(), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) return r;
  return { ok: true, id: r.data.id || r.data.uid, url: r.data.url };
}

export async function listEnv() {
  const { projectId } = cfg();
  if (!projectId) return { ok: false, error: 'VERCEL_PROJECT_ID required for env list' };
  const r = await vercel('/v9/projects/' + projectId + '/env' + qs());
  if (!r.ok) return r;
  const envs = r.data.envs || r.data || [];
  return {
    ok: true,
    envs: envs.map((e) => ({
      key: e.key,
      target: e.target,
      type: e.type,
      value: e.value ? '***masked***' : undefined,
      id: e.id,
    })),
  };
}

export async function getDeployment(id) {
  const r = await vercel('/v13/deployments/' + encodeURIComponent(id) + qs());
  if (!r.ok) return r;
  return {
    ok: true,
    id: r.data.id || r.data.uid,
    url: r.data.url,
    state: r.data.readyState || r.data.state,
    errorMessage: r.data.errorMessage,
  };
}

export default { vercel, listDeployments, redeploy, listEnv, getDeployment, cfg };
