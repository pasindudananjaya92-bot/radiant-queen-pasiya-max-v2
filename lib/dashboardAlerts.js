import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listAlerts(limit = 10) {
  const client = sb();
  if (!client) return { ok: false, alerts: [], unseen: 0 };
  const { data, error } = await client
    .from('dash_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, alerts: [], unseen: 0, error: error.message };
  const alerts = data || [];
  const unseen = alerts.filter((a) => !a.seen && (a.severity === 'critical' || a.severity === 'warn')).length;
  return { ok: true, alerts, unseen };
}

export async function markAlertsSeen() {
  const client = sb();
  if (!client) return { ok: false };
  await client.from('dash_alerts').update({ seen: true }).eq('seen', false);
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
  });
}

/** Build live alerts from health + cron (no Sentry required) */
export async function collectLiveAlerts() {
  const alerts = [];
  // Health
  try {
    const hm = await import('./healthManager.js');
    if (typeof hm.runFullCheck === 'function') {
      const h = await hm.runFullCheck();
      const checks = h.checks || h.items || [];
      for (const c of checks) {
        if (c && c.ok === false) {
          alerts.push({
            source: 'health',
            severity: 'critical',
            title: `${c.name} down`,
            body: c.detail || '',
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
      const st = j.lastStatus;
      const bad = st != null && st !== 0 && st !== 1 && st !== 200 && st !== 201 && st !== 204;
      if (bad && j.enabled !== false) {
        alerts.push({
          source: 'cron',
          severity: 'warn',
          title: `Cron fail: ${j.title || j.jobId}`,
          body: `lastStatus=${st}`,
          created_at: new Date().toISOString(),
          seen: false,
          live: true,
        });
      }
    }
  } catch (_) {}

  // Stored
  const stored = await listAlerts(10);
  const merged = [...alerts, ...(stored.alerts || [])].slice(0, 12);
  const unseen = merged.filter((a) => !a.seen && a.severity !== 'info').length;
  return { ok: true, alerts: merged, unseen };
}
