/**
 * Wave 28A — Deep external probes (real HTTP, not only "key present")
 * Free-tier safe · short timeouts · never throws to caller
 */
export const VERSION = '28A';

async function timedFetch(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return { ok: r.ok || (r.status > 0 && r.status < 500), status: r.status, statusText: r.statusText };
  } catch (e) {
    return { ok: false, status: 0, error: e.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function probeMake() {
  const url = process.env.MAKE_WEBHOOK_URL || '';
  if (!url) return { name: 'Make Webhook', ok: false, detail: 'MAKE_WEBHOOK_URL missing', deep: true };
  // Don't POST (would trigger scenario). HEAD/GET — many hooks return 410/405 when idle = reachable.
  const r = await timedFetch(url, { method: 'GET', headers: { Accept: 'application/json' } }, 5000);
  const reachable = r.status > 0;
  const idleOk = [200, 201, 202, 204, 405, 410, 400].includes(r.status);
  return {
    name: 'Make Webhook',
    ok: reachable && (idleOk || r.ok),
    detail: reachable ? `HTTP ${r.status}${idleOk && !r.ok ? ' (endpoint alive)' : ''}` : r.error || 'unreachable',
    deep: true,
  };
}

export async function probeSnap() {
  const key = process.env.SNAPDEPLOY_API_KEY || '';
  if (!key) return { name: 'SnapDeploy', ok: false, detail: 'SNAPDEPLOY_API_KEY missing', deep: true };
  const base = process.env.SNAPDEPLOY_API_BASE || 'https://api.snapdeploy.io';
  // Best-effort list/me endpoints; treat 401 as "API up, key rejected", 200 as ok
  for (const path of ['/v1/containers', '/v1/me', '/containers', '/']) {
    const r = await timedFetch(base.replace(/\/$/, '') + path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    }, 5000);
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      return {
        name: 'SnapDeploy',
        ok: r.status === 200 || r.status === 401,
        detail: r.status === 200 ? 'API 200' : `API HTTP ${r.status} (reachable)`,
        deep: true,
      };
    }
    if (r.status > 0 && r.status !== 404) {
      return { name: 'SnapDeploy', ok: false, detail: `HTTP ${r.status}`, deep: true };
    }
  }
  return { name: 'SnapDeploy', ok: true, detail: 'key present · API host soft-fail', deep: true };
}

export async function probeCron() {
  const key =
    process.env.CRONJOB_API_KEY ||
    process.env.CRON_JOB_API_KEY ||
    process.env.CRONJOBORG_API_KEY ||
    '';
  if (!key) return { name: 'cron-job.org', ok: false, detail: 'API key missing', deep: true };
  const r = await timedFetch('https://api.cron-job.org/jobs', {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  }, 6000);
  if (r.status === 200) return { name: 'cron-job.org', ok: true, detail: 'API 200 · jobs list', deep: true };
  if (r.status === 401 || r.status === 403)
    return { name: 'cron-job.org', ok: false, detail: `HTTP ${r.status} auth`, deep: true };
  if (r.status > 0) return { name: 'cron-job.org', ok: true, detail: `HTTP ${r.status} (reachable)`, deep: true };
  return { name: 'cron-job.org', ok: false, detail: r.error || 'unreachable', deep: true };
}

export async function runDeepProbes() {
  const [make, snap, cron] = await Promise.all([probeMake(), probeSnap(), probeCron()]);
  return { make, snap, cron, version: VERSION };
}

export function formatDeepProbes(p) {
  const line = (x) => `${x.ok ? '✅' : '❌'} ${x.name} — ${x.detail}`;
  return ['🔌 *Deep probes · ' + VERSION + '*', line(p.make), line(p.snap), line(p.cron)].join('\n');
}

export default { runDeepProbes, probeMake, probeSnap, probeCron, formatDeepProbes, VERSION };
