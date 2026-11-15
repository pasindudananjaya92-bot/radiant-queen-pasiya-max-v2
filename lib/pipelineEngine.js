/**
 * Wave 12C–12E — Command Pipeline (Agent Lab)
 * 12E: fail-only filter + fail alerts for Telegram + Dashboard
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function classifyCommand(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '')
    .toLowerCase();
  const rules = [
    [/^(swarm|nation|corps|mission)\b/, 'oracle', 'mission'],
    [/^(heal|immune|playbook)\b/, 'healer', 'immune'],
    [/^(sentinel|audit|cyber)\b/, 'sentinel', 'security'],
    [/^(scout|intel)\b/, 'scout', 'intel'],
    [/^(codeswarm|codeheal|fixswarm)\b/, 'builder', 'codeswarm'],
    [/^(pipeline|lab)\b/, 'auditor', 'pipeline'],
    [/^(think)\b/, 'oracle', 'think'],
    [/^(health|healcheck|doctor)\b/, 'watchdog', 'health'],
    [/^(vault)\b/, 'quartermaster', 'vault'],
    [/^(drive)\b/, 'quartermaster', 'drive'],
    [/^(mem|remember|brain|what is my|forget)\b/, 'researcher', 'memory'],
    [/^(bank)\b/, 'quartermaster', 'bank'],
    [/^(shadow)\b/, 'scribe', 'shadow'],
    [/^(morning|night)\b/, 'envoy', 'briefing'],
    [/^(make)\b/, 'executor', 'make'],
    [/^(snap)\b/, 'healer', 'snap'],
    [/^(cron)\b/, 'healer', 'cron'],
    [/^(gh|upload|ghpath)\b/, 'builder', 'github'],
    [/^(mail|email|tts)\b/, 'envoy', 'comms'],
    [/^(doc)\b/, 'researcher', 'document'],
    [/^(voice)\b/, 'envoy', 'voice'],
    [/^(menu|commands|si|ping)\b/, 'envoy', 'ui'],
    [/^(render|deploy)\b/, 'executor', 'deploy'],
    [/^(sql)\b/, 'builder', 'sql'],
  ];
  for (const [re, corps, family] of rules) {
    if (re.test(t)) return { corps, family, matched: true };
  }
  return { corps: 'general', family: 'chat', matched: false };
}

export async function logPipeline(row) {
  const client = sb();
  if (!client) return { ok: false };
  try {
    await client.from('rq_pipeline_log').insert({
      raw_text: String(row.raw_text || '').slice(0, 300),
      family: String(row.family || '').slice(0, 40),
      corps: String(row.corps || '').slice(0, 40),
      stage: String(row.stage || 'done').slice(0, 40),
      ok: row.ok !== false,
      ms: Number(row.ms) || 0,
      detail: String(row.detail || '').slice(0, 500),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** @param {{limit?:number, failsOnly?:boolean, family?:string}} opts */
export async function recentPipeline(opts = {}) {
  const limit = opts.limit ?? 12;
  const failsOnly = !!opts.failsOnly;
  const family = opts.family ? String(opts.family) : '';
  const client = sb();
  if (!client) return [];
  let q = client
    .from('rq_pipeline_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (failsOnly) q = q.eq('ok', false);
  if (family) q = q.eq('family', family);
  const { data } = await q;
  return data || [];
}

export async function pipelineStats(limit = 40, failsOnly = false) {
  const rows = await recentPipeline({ limit, failsOnly });
  // For stats totals use unfiltered window when not failsOnly
  const allRows = failsOnly ? rows : await recentPipeline({ limit });
  const byFamily = {};
  const byCorps = {};
  let ok = 0;
  let fail = 0;
  for (const r of allRows) {
    byFamily[r.family || 'unknown'] = (byFamily[r.family || 'unknown'] || 0) + 1;
    byCorps[r.corps || 'unknown'] = (byCorps[r.corps || 'unknown'] || 0) + 1;
    if (r.ok === false) fail += 1;
    else ok += 1;
  }
  return {
    ok: true,
    total: allRows.length,
    ok_count: ok,
    fail_count: fail,
    byFamily,
    byCorps,
    recent: failsOnly ? rows : allRows.slice(0, 12),
    filter: failsOnly ? 'fails' : 'all',
  };
}

/** Fail-only alert digest for Telegram / bell */
export async function failAlerts(limit = 10) {
  const fails = await recentPipeline({ limit, failsOnly: true });
  return {
    ok: true,
    count: fails.length,
    has_fails: fails.length > 0,
    items: fails,
  };
}

export function verifyReply(reply) {
  const s = String(reply || '').trim();
  if (!s) return { ok: false, reason: 'empty_reply' };
  if (/^❌\s*Mission Control returned empty/i.test(s)) return { ok: false, reason: 'empty_mission' };
  if (/command ['"]?\w+['"]? does not exist/i.test(s)) return { ok: false, reason: 'hallucinated_unknown' };
  if (/Syntax blocked|Unhealed syntax|Upload blocked|unbalanced paren/i.test(s))
    return { ok: false, reason: 'syntax_block' };
  if (/^❌/.test(s)) return { ok: false, reason: 'error_reply' };
  return { ok: true, reason: 'ok' };
}

export async function finalizePipeline({ text, reply, ms, stage = 'execute' }) {
  const cls = classifyCommand(text);
  let ver = verifyReply(reply);
  // Wave 13B — treat hard error replies as pipeline fails
  const replyStr = String(reply || '');
  if (ver.ok && /^❌/.test(replyStr.trim())) {
    ver = { ok: false, reason: 'error_reply' };
  }
  await logPipeline({
    raw_text: text,
    family: cls.family,
    corps: cls.corps,
    stage: ver.ok ? stage : 'verify_fail',
    ok: ver.ok,
    ms,
    detail: ver.ok ? `corps=${cls.corps}` : ver.reason,
  });

  // Wave 13B — auto-open QA ticket on fail
  if (!ver.ok) {
    try {
      const qa = await import('./qaEngine.js');
      await qa.openTicket({
        title: `Pipeline fail: ${cls.family}/${cls.corps}`,
        detail: `cmd=${String(text || '').slice(0, 120)} | reason=${ver.reason} | reply=${replyStr.slice(0, 400)}`,
        fingerprint: `pipeline:${cls.family}:${ver.reason}:${String(text || '').slice(0, 40)}`,
      });
    } catch (_) {}
  }

  return {
    reply,
    pipeline: {
      family: cls.family,
      corps: cls.corps,
      verify: ver,
      ms,
    },
  };
}

export function pipelineHelp() {
  return (
    '*Agent Lab Pipeline · Wave 12E*\n' +
    '`Gate → Classify → Execute → Verify → Log`\n\n' +
    '• `pipeline help` — menu\n' +
    '• `pipeline status` — online\n' +
    '• `pipeline last` — recent (all)\n' +
    '• `pipeline fails` — fail-only alerts\n' +
    '• `pipeline stats` — family/corps counts\n\n' +
    '_Dashboard War → Lab: All / Fails filter_'
  );
}

export default {
  classifyCommand,
  logPipeline,
  recentPipeline,
  pipelineStats,
  failAlerts,
  verifyReply,
  finalizePipeline,
  pipelineHelp,
};
