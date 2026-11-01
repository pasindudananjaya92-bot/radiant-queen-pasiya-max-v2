/**
 * Agent-19 · SnapDeploy Manager
 * Full REST client for https://snapdeploy.dev/api/mobile/*
 * Founder-only. No deletes possible (API refuses them for tokens).
 *
 * Env required:
 *   SNAPDEPLOY_API_KEY = sd_pat_...   (deploy scope recommended)
 *
 * Optional:
 *   SNAPDEPLOY_BASE_URL = https://snapdeploy.dev   (default)
 */

const BASE = (process.env.SNAPDEPLOY_BASE_URL || 'https://snapdeploy.dev').replace(/\/$/, '');
const API_KEY = process.env.SNAPDEPLOY_API_KEY || '';

function headers(extra = {}) {
  if (!API_KEY) throw new Error('SNAPDEPLOY_API_KEY is not set');
  return {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-SnapDeploy-Client': 'pasiya-bot/agent19',
    ...extra,
  };
}

async function req(method, path, { body, idempotencyKey, query } = {}) {
  const url = new URL(`${BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const opts = {
    method,
    headers: headers(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey) } : {}),
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 800) };
  }

  if (!res.ok) {
    const msg =
      data.message ||
      data.errorMessage ||
      data.error ||
      data.linkError?.message ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    err.code = data.errorCode || data.code || null;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ */
/*  Account / Quota                                                   */
/* ------------------------------------------------------------------ */

export async function bootstrap() {
  return req('GET', '/api/mobile/bootstrap');
}

export async function getDeployCap() {
  return req('GET', '/api/mobile/deploy-cap');
}

export async function listApps() {
  const b = await bootstrap();
  return {
    user: b.user,
    containers: b.containers || [],
    deployCap: b.deployCap,
    usage: b.usage,
  };
}

/* ------------------------------------------------------------------ */
/*  Containers                                                        */
/* ------------------------------------------------------------------ */

export async function getContainer(containerId) {
  return req('GET', `/api/mobile/containers/${containerId}`);
}

export async function findContainer(nameOrId) {
  const { containers } = await listApps();
  const q = String(nameOrId).toLowerCase().trim();
  return (
    containers.find((c) => c.containerId === nameOrId) ||
    containers.find((c) => (c.name || '').toLowerCase() === q) ||
    containers.find((c) => (c.name || '').toLowerCase().includes(q)) ||
    null
  );
}

export async function startContainer(containerId) {
  return req('POST', `/api/mobile/containers/${containerId}/start`);
}

export async function stopContainer(containerId) {
  return req('POST', `/api/mobile/containers/${containerId}/stop`);
}

export async function restartContainer(containerId) {
  return req('POST', `/api/mobile/containers/${containerId}/restart`);
}

export async function wakeContainer(containerId) {
  return req('POST', `/api/mobile/containers/${containerId}/wake`);
}

export async function getLogs(containerId, lines = 200) {
  return req('GET', `/api/mobile/containers/${containerId}/logs`, {
    query: { lines: Math.min(1000, Math.max(50, lines)) },
  });
}

export async function getDeployments(containerId, limit = 10) {
  return req('GET', `/api/mobile/containers/${containerId}/deployments`, {
    query: { limit: Math.min(50, limit) },
  });
}

export async function setEnv(containerId, environmentVariables) {
  return req('PUT', `/api/mobile/containers/${containerId}/env`, {
    body: { environmentVariables },
  });
}

/* ------------------------------------------------------------------ */
/*  Deploy                                                            */
/* ------------------------------------------------------------------ */

/**
 * One-call create + link + first build.
 * body: { repo, name?, branch?, size?, env?, port? }
 */
export async function deploy(body, idempotencyKey) {
  return req('POST', '/api/mobile/deploy', {
    body,
    idempotencyKey: idempotencyKey || `pasiya-${Date.now()}`,
  });
}

/**
 * Redeploy an already-linked repo (safe with Idempotency-Key).
 */
export async function redeployLinked(repoLinkId, idempotencyKey) {
  return req('POST', `/api/mobile/github/link/${repoLinkId}/deploy`, {
    idempotencyKey: idempotencyKey || `redeploy-${Date.now()}`,
  });
}

export async function getDeployment(deploymentId) {
  return req('GET', `/api/mobile/deployments/${deploymentId}`);
}

/* ------------------------------------------------------------------ */
/*  Smart Heal                                                        */
/* ------------------------------------------------------------------ */

/**
 * Intelligent heal for a container (by name or id).
 * Steps:
 *  1. Resolve container
 *  2. Wake (free-tier sleep)
 *  3. Restart
 *  4. Pull latest status + last deployment + short log tail
 *  5. Optionally trigger redeploy if still unhealthy and linked
 */
export async function healContainer(nameOrId, { forceRedeploy = false } = {}) {
  const c = await findContainer(nameOrId);
  if (!c) throw new Error(`Container not found: ${nameOrId}`);

  const result = {
    containerId: c.containerId,
    name: c.name,
    url: c.url,
    steps: [],
  };

  // 1. Wake
  try {
    await wakeContainer(c.containerId);
    result.steps.push({ action: 'wake', ok: true });
  } catch (e) {
    result.steps.push({ action: 'wake', ok: false, error: e.message });
  }

  // small pause so wake can take effect
  await new Promise((r) => setTimeout(r, 2500));

  // 2. Restart
  try {
    await restartContainer(c.containerId);
    result.steps.push({ action: 'restart', ok: true });
  } catch (e) {
    result.steps.push({ action: 'restart', ok: false, error: e.message });
  }

  await new Promise((r) => setTimeout(r, 3000));

  // 3. Fresh status
  let status;
  try {
    status = await getContainer(c.containerId);
    result.status = status.status || status.state || 'unknown';
    result.steps.push({ action: 'status', ok: true, status: result.status });
  } catch (e) {
    result.steps.push({ action: 'status', ok: false, error: e.message });
  }

  // 4. Last deployment + log tail
  try {
    const deps = await getDeployments(c.containerId, 3);
    const list = Array.isArray(deps) ? deps : deps.deployments || deps.items || [];
    result.lastDeployment = list[0] || null;
  } catch {
    result.lastDeployment = null;
  }

  try {
    const logs = await getLogs(c.containerId, 80);
    const lines = Array.isArray(logs) ? logs : logs.lines || logs.log || logs.raw || '';
    result.logTail = typeof lines === 'string' ? lines.slice(-1200) : JSON.stringify(lines).slice(-1200);
  } catch {
    result.logTail = null;
  }

  // 5. Optional force redeploy (if we know the link)
  if (forceRedeploy && c.repoLinkId) {
    try {
      const rd = await redeployLinked(c.repoLinkId, `heal-${c.containerId}-${Date.now()}`);
      result.steps.push({ action: 'redeploy', ok: true, deploymentId: rd.deploymentId });
      result.redeploy = rd;
    } catch (e) {
      result.steps.push({ action: 'redeploy', ok: false, error: e.message });
    }
  }

  result.healedAt = new Date().toISOString();
  return result;
}

/* ------------------------------------------------------------------ */
/*  Pretty helpers (for Telegram)                                     */
/* ------------------------------------------------------------------ */

export function formatList(data) {
  const { containers = [], deployCap, usage, user } = data;
  const lines = [
    `📦 *SnapDeploy Containers* (${containers.length})`,
    user?.plan ? `Plan: \`${user.plan}\`` : '',
    deployCap
      ? `Deploy cap: ${deployCap.remaining ?? '?'}/${deployCap.dailyLimit ?? '?'} remaining`
      : '',
    usage
      ? `Hours: ${usage.hoursUsed?.toFixed?.(1) ?? usage.hoursUsed}/${usage.hoursLimit} used`
      : '',
    '',
  ].filter(Boolean);

  if (!containers.length) {
    lines.push('_No containers found._');
    return lines.join('\n');
  }

  for (const c of containers) {
    const st = (c.status || c.state || '?').toUpperCase();
    const emoji =
      st === 'RUNNING' || st === 'ACTIVE' ? '🟢' :
      st === 'SLEEPING' || st === 'IDLE' ? '😴' :
      st === 'STOPPED' ? '🔴' : '🟡';
    lines.push(
      `${emoji} *${c.name || c.containerId}*`,
      `   \`${c.containerId}\``,
      c.url ? `   ${c.url}` : '',
      `   status: \`${st}\``,
      ''
    );
  }
  return lines.join('\n').trim();
}

export function formatStatus(c) {
  if (!c) return 'Container not found.';
  const st = (c.status || c.state || '?').toUpperCase();
  return [
    `📦 *${c.name || c.containerId}*`,
    `ID: \`${c.containerId}\``,
    `Status: \`${st}\``,
    c.url ? `URL: ${c.url}` : '',
    c.port ? `Port: ${c.port}` : '',
    c.detectedTechnology || c.technology
      ? `Tech: ${c.detectedTechnology || c.technology}`
      : '',
    c.memory ? `Memory: ${c.memory} MB` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatHeal(result) {
  const lines = [
    `🛠️ *Heal result · ${result.name}*`,
    `ID: \`${result.containerId}\``,
    result.url ? `URL: ${result.url}` : '',
    `Final status: \`${result.status || '?'}\``,
    '',
    '*Steps:*',
  ];
  for (const s of result.steps) {
    lines.push(`${s.ok ? '✅' : '❌'} ${s.action}${s.error ? ` — ${s.error}` : s.status ? ` → ${s.status}` : ''}`);
  }
  if (result.lastDeployment) {
    const d = result.lastDeployment;
    lines.push(
      '',
      `Last deploy: \`${d.status || '?'}\`${d.errorCode ? ` (${d.errorCode})` : ''}`
    );
    if (d.errorMessage) lines.push(`_${d.errorMessage.slice(0, 200)}_`);
  }
  if (result.logTail) {
    lines.push('', '*Log tail:*', '```', result.logTail.slice(-900), '```');
  }
  return lines.join('\n');
}

export default {
  bootstrap,
  listApps,
  getDeployCap,
  getContainer,
  findContainer,
  startContainer,
  stopContainer,
  restartContainer,
  wakeContainer,
  getLogs,
  getDeployments,
  setEnv,
  deploy,
  redeployLinked,
  getDeployment,
  healContainer,
  formatList,
  formatStatus,
  formatHeal,
};
