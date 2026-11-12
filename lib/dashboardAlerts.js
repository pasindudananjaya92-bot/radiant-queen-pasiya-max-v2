import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listAlerts(limit = 20) {
  const client = sb();
  if (!client) return { ok: false, alerts: [], unseen: 0 };
  const { data, error } = await client
    .from('dash_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, alerts: [], unseen: 0, error: error.message };
  const alerts = data || [];
  const unseen = alerts.filter((a) => !a.seen).length;
  return { ok: true, alerts, unseen };
}

export async function markAlertsSeen() {
  const client = sb();
  if (!client) return { ok: false };
  await client.from('dash_alerts').update({ seen: true }).eq('seen', false);
  return { ok: true };
}

export async function clearAlerts() {
  const client = sb();
  if (!client) return { ok: false };
  await client.from('dash_alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return { ok: true };
}

export async function pushAlert({ source, severity = 'info', title, body }) {
  const client = sb();
  if (!client) return;
  await client.from('dash_alerts').insert({
    source,
    severity,
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 2000),
    seen: false,
  });
}

/** Live + stored alerts (health, cron, sentry, hull queue stuck) */
export async function collectLiveAlerts() {
  const alerts = [];

  // Stored
  try {
    const stored = await listAlerts(15);
    for (const a of stored.alerts || []) {
      alerts.push({
        id: a.id,
        source: a.source || 'db',
        severity: a.severity || a.level || 'info',
        level: a.severity || 'info',
        title: a.title,
        message: a.body || a.title,
        body: a.body,
        created_at: a.created_at,
        seen: !!a.seen,
        live: false,
      });
    }
  } catch (_) {}

  // Health
  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    if (typeof fn === 'function') {
      const h = await fn();
      const checks = h.checks || h.items || h.results || [];
      for (const c of checks) {
        if (c && c.ok === false) {
          alerts.push({
            source: 'health',
            severity: 'critical',
            level: 'critical',
            title: `${c.name || c.id || 'service'} down`,
            message: c.detail || c.error || '',
            body: c.detail || c.error || '',
            created_at: new Date().toISOString(),
            seen: false,
            live: true,
          });
        }
      }
    }
  } catch (_) {}

  // Cron fails
  try {
    const cm = await import('./cronManager.js');
    const jobs = await cm.listJobs();
    for (const j of jobs || []) {
      const st = j.lastStatus ?? j.last_status ?? j.statusCode;
      const enabled = j.enabled !== false && j.enabled !== 0;
      const bad =
        st != null &&
        st !== 0 &&
        st !== 1 &&
        st !== 200 &&
        st !== 201 &&
        st !== 204 &&
        String(st).toLowerCase() !== 'ok';
      if (enabled && bad) {
        alerts.push({
          source: 'cron',
          severity: 'warn',
          level: 'warn',
          title: `Cron: ${j.title || j.name || j.jobId || j.id}`,
          message: `last status ${st}`,
          body: `last status ${st}`,
          created_at: new Date().toISOString(),
          seen: false,
          live: true,
        });
      }
    }
  } catch (_) {}

  // Stuck Hull B jobs
  try {
    const client = sb();
    if (client) {
      const { data } = await client
        .from('think_jobs')
        .select('id, status, prompt, created_at')
        .in('status', ['queued', 'running', 'processing'])
        .order('created_at', { ascending: true })
        .limit(5);
      for (const j of data || []) {
        const age = Date.now() - new Date(j.created_at).getTime();
        if (age > 10 * 60 * 1000) {
          alerts.push({
            source: 'hullb',
            severity: 'warn',
            level: 'warn',
            title: `Think job stuck #${j.id}`,
            message: String(j.prompt || '').slice(0, 80),
            body: String(j.prompt || '').slice(0, 120),
            created_at: j.created_at,
            seen: false,
            live: true,
          });
        }
      }
    }
  } catch (_) {}

  // Sentry unresolved (optional)
  try {
    if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
      const url = `https://sentry.io/api/0/projects/${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT}/issues/?query=is:unresolved&limit=5`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const issues = await res.json();
        for (const iss of issues || []) {
          alerts.push({
            source: 'sentry',
            severity: 'critical',
            level: 'critical',
            title: iss.title || 'Sentry issue',
            message: iss.culprit || iss.shortId || '',
            body: iss.culprit || '',
            created_at: iss.lastSeen || new Date().toISOString(),
            seen: false,
            live: true,
          });
        }
      }
    }
  } catch (_) {}

  // Sort: critical first, then unseen
  const rank = { critical: 0, warn: 1, warning: 1, info: 2 };
  alerts.sort(
    (a, b) =>
      (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) ||
      Number(!!a.seen) - Number(!!b.seen)
  );

  const unseen = alerts.filter((a) => !a.seen && a.severity !== 'info').length;
  return { ok: true, alerts: alerts.slice(0, 25), unseen, count: alerts.length };
}
