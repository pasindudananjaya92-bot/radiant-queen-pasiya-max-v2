/**
 * Wave 11C — Immune System / Healer auto-playbooks
 * Flow: detect alerts → match playbook → safe fix → verify → log
 * Only auto-safe actions (no destructive ops).
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function logHeal(row) {
  const client = sb();
  if (!client) return;
  try {
    await client.from('rq_heal_log').insert({
      playbook: String(row.playbook || '').slice(0, 80),
      status: String(row.status || 'attempted').slice(0, 40),
      detail: String(row.detail || '').slice(0, 2000),
      verified: !!row.verified,
      meta: row.meta || {},
    });
  } catch (_) {}
}

export async function listPlaybooks() {
  return [
    {
      id: 'cron_heal',
      name: 'Cron Healer',
      when: 'Cron job disabled or last status fail',
      action: 'cronManager.healJobs — re-enable our jobs',
      auto: true,
    },
    {
      id: 'think_stuck',
      name: 'Hull B Stuck Jobs',
      when: 'think_jobs queued/running > 10 minutes',
      action: 'Mark stuck jobs failed + note',
      auto: true,
    },
    {
      id: 'health_recheck',
      name: 'Health Recheck',
      when: 'Any health surface DOWN',
      action: 'Re-run health probe (verify only)',
      auto: true,
    },
    {
      id: 'alerts_ack',
      name: 'Ack cleared alerts',
      when: 'After successful heals',
      action: 'markAlertsSeen for stored alerts',
      auto: true,
    },
  ];
}

async function collectSignals() {
  const signals = { alerts: [], healthDown: [], cronBad: [], stuckJobs: [] };

  try {
    const al = await import('./dashboardAlerts.js');
    const r = await al.collectLiveAlerts();
    signals.alerts = r.alerts || [];
    signals.unseen = r.unseen || 0;
  } catch (_) {}

  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    if (typeof fn === 'function') {
      const h = await fn();
      const checks = h.checks || h.results || [];
      for (const c of checks || []) {
        if (c && c.ok === false) {
          signals.healthDown.push({ name: c.name || c.id, detail: c.detail || c.error || '' });
        }
      }
      signals.healthRaw = h;
    }
  } catch (e) {
    signals.healthError = e.message || String(e);
  }

  try {
    const cm = await import('./cronManager.js');
    const jobs = await cm.listJobs();
    for (const j of jobs || []) {
      const st = j.lastStatus ?? j.last_status ?? j.statusCode;
      const enabled = j.enabled !== false && j.enabled !== 0;
      const bad =
        !enabled ||
        (st != null &&
          st !== 0 &&
          st !== 1 &&
          st !== 200 &&
          st !== 201 &&
          st !== 204 &&
          String(st).toLowerCase() !== 'ok');
      if (bad) {
        signals.cronBad.push({
          id: j.jobId || j.id,
          title: j.title || j.name || String(j.jobId || j.id),
          enabled,
          lastStatus: st,
        });
      }
    }
  } catch (e) {
    signals.cronError = e.message || String(e);
  }

  try {
    const client = sb();
    if (client) {
      const { data } = await client
        .from('think_jobs')
        .select('id, status, prompt, created_at')
        .in('status', ['queued', 'running', 'processing'])
        .order('created_at', { ascending: true })
        .limit(20);
      const now = Date.now();
      for (const j of data || []) {
        const age = now - new Date(j.created_at).getTime();
        if (age > 10 * 60 * 1000) {
          signals.stuckJobs.push({
            id: j.id,
            status: j.status,
            ageMin: Math.round(age / 60000),
            prompt: String(j.prompt || '').slice(0, 80),
          });
        }
      }
    }
  } catch (_) {}

  return signals;
}

async function playbookCronHeal(signals) {
  if (!signals.cronBad?.length && !signals.cronError) {
    return { playbook: 'cron_heal', status: 'skipped', detail: 'No bad cron jobs', verified: true };
  }
  try {
    const cm = await import('./cronManager.js');
    let result;
    if (typeof cm.healJobs === 'function') {
      result = await cm.healJobs({});
    } else if (typeof cm.enableJob === 'function') {
      const done = [];
      for (const j of signals.cronBad.slice(0, 8)) {
        if (j.id && j.enabled === false) {
          await cm.enableJob(j.id);
          done.push(j.id);
        }
      }
      result = { enabled: done };
    } else {
      return { playbook: 'cron_heal', status: 'failed', detail: 'cronManager.healJobs missing', verified: false };
    }
    // verify
    const jobs = await cm.listJobs();
    const stillBad = (jobs || []).filter((j) => {
      const enabled = j.enabled !== false && j.enabled !== 0;
      return !enabled;
    });
    const ok = stillBad.length === 0 || stillBad.length < signals.cronBad.length;
    const detail = `healJobs ok · was ${signals.cronBad.length} bad · still disabled ${stillBad.length} · ${JSON.stringify(result).slice(0, 200)}`;
    return { playbook: 'cron_heal', status: ok ? 'success' : 'failed', detail, verified: ok, meta: { result } };
  } catch (e) {
    return { playbook: 'cron_heal', status: 'failed', detail: e.message || String(e), verified: false };
  }
}

async function playbookThinkStuck(signals) {
  if (!signals.stuckJobs?.length) {
    return { playbook: 'think_stuck', status: 'skipped', detail: 'No stuck think jobs', verified: true };
  }
  const client = sb();
  if (!client) {
    return { playbook: 'think_stuck', status: 'failed', detail: 'No supabase', verified: false };
  }
  try {
    const ids = signals.stuckJobs.map((j) => j.id);
    const { error } = await client
      .from('think_jobs')
      .update({
        status: 'failed',
        error: 'auto-healed: stuck >10m (Wave 11C)',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (error) throw new Error(error.message);
    // verify
    const { data } = await client.from('think_jobs').select('id, status').in('id', ids);
    const still = (data || []).filter((j) => j.status === 'queued' || j.status === 'running');
    const ok = still.length === 0;
    return {
      playbook: 'think_stuck',
      status: ok ? 'success' : 'failed',
      detail: `Marked ${ids.length} stuck job(s) failed · remaining active ${still.length}`,
      verified: ok,
      meta: { ids },
    };
  } catch (e) {
    return { playbook: 'think_stuck', status: 'failed', detail: e.message || String(e), verified: false };
  }
}

async function playbookHealthRecheck(signals) {
  if (!signals.healthDown?.length && !signals.healthError) {
    return { playbook: 'health_recheck', status: 'skipped', detail: 'Health already OK', verified: true };
  }
  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    if (typeof fn !== 'function') {
      return { playbook: 'health_recheck', status: 'failed', detail: 'No health fn', verified: false };
    }
    const h = await fn();
    const checks = h.checks || h.results || [];
    const down = (checks || []).filter((c) => c && c.ok === false);
    const ok = down.length === 0;
    return {
      playbook: 'health_recheck',
      status: ok ? 'success' : 'failed',
      detail: ok
        ? 'Recheck green — transient blip'
        : `Still down: ${down.map((c) => c.name || c.id).join(', ')}`,
      verified: ok,
      meta: { down: down.map((c) => c.name || c.id) },
    };
  } catch (e) {
    return { playbook: 'health_recheck', status: 'failed', detail: e.message || String(e), verified: false };
  }
}

async function playbookAlertsAck(healResults) {
  const anySuccess = (healResults || []).some((r) => r.status === 'success');
  if (!anySuccess) {
    return { playbook: 'alerts_ack', status: 'skipped', detail: 'No successful heals to ack', verified: true };
  }
  try {
    const al = await import('./dashboardAlerts.js');
    if (typeof al.markAlertsSeen === 'function') {
      await al.markAlertsSeen();
      return { playbook: 'alerts_ack', status: 'success', detail: 'Stored alerts marked seen', verified: true };
    }
    return { playbook: 'alerts_ack', status: 'skipped', detail: 'markAlertsSeen missing', verified: true };
  } catch (e) {
    return { playbook: 'alerts_ack', status: 'failed', detail: e.message || String(e), verified: false };
  }
}

/**
 * Full immune cycle: detect → fix → verify → log
 */
export async function runImmuneCycle({ dryRun = false } = {}) {
  const t0 = Date.now();
  const signals = await collectSignals();
  const results = [];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      ms: Date.now() - t0,
      signals: summarizeSignals(signals),
      results: [
        {
          playbook: 'dry_run',
          status: 'skipped',
          detail: 'Dry run — no changes',
          verified: true,
        },
      ],
      report: formatReport(signals, [], Date.now() - t0, true),
    };
  }

  results.push(await playbookCronHeal(signals));
  results.push(await playbookThinkStuck(signals));
  results.push(await playbookHealthRecheck(signals));
  results.push(await playbookAlertsAck(results));

  for (const r of results) {
    await logHeal(r);
  }

  const ms = Date.now() - t0;
  return {
    ok: true,
    dryRun: false,
    ms,
    signals: summarizeSignals(signals),
    results,
    report: formatReport(signals, results, ms, false),
  };
}

function summarizeSignals(s) {
  return {
    alerts: (s.alerts || []).length,
    unseen: s.unseen || 0,
    healthDown: (s.healthDown || []).map((x) => x.name),
    cronBad: (s.cronBad || []).map((x) => x.title || x.id),
    stuckJobs: (s.stuckJobs || []).map((x) => `#${x.id} ${x.ageMin}m`),
  };
}

function formatReport(signals, results, ms, dry) {
  const lines = [
    `🛡️ *Immune System · Wave 11C*${dry ? ' (dry-run)' : ''}`,
    `Elapsed: ${ms}ms`,
    '',
    '*Signals*',
    `· Alerts: ${(signals.alerts || []).length} (unseen ${signals.unseen || 0})`,
    `· Health DOWN: ${
      (signals.healthDown || []).length
        ? signals.healthDown.map((x) => x.name).join(', ')
        : 'none'
    }`,
    `· Cron bad: ${
      (signals.cronBad || []).length
        ? signals.cronBad.map((x) => x.title || x.id).join(', ')
        : 'none'
    }`,
    `· Stuck think jobs: ${(signals.stuckJobs || []).length}`,
    '',
    '*Playbooks*',
  ];
  for (const r of results || []) {
    const icon =
      r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭' : r.status === 'failed' ? '❌' : '·';
    lines.push(
      `${icon} *${r.playbook}* — ${r.status}${r.verified ? ' · verified' : ''}\n${r.detail || ''}`
    );
  }
  const failed = (results || []).filter((r) => r.status === 'failed');
  lines.push('');
  lines.push(
    failed.length
      ? `⚠ ${failed.length} playbook(s) need Founder attention.`
      : '✓ Immune cycle clean — no failed playbooks.'
  );
  return lines.join('\n');
}

export async function recentHealLog(limit = 8) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_heal_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export default { runImmuneCycle, listPlaybooks, recentHealLog, collectSignals };
