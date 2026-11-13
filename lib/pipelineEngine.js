/**
 * Wave 12C/12D — Command Pipeline (Agent Lab)
 * Gate → Classify → Execute → Verify → Log
 * 12D: expanded families + stats for Dashboard Lab panel
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Map command prefix → corps + family (12D expanded) */
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

export async function recentPipeline(limit = 12) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_pipeline_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

/** Aggregate for Dashboard Lab */
export async function pipelineStats(limit = 40) {
  const rows = await recentPipeline(limit);
  const byFamily = {};
  const byCorps = {};
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    byFamily[r.family || 'unknown'] = (byFamily[r.family || 'unknown'] || 0) + 1;
    byCorps[r.corps || 'unknown'] = (byCorps[r.corps || 'unknown'] || 0) + 1;
    if (r.ok === false) fail += 1;
    else ok += 1;
  }
  return {
    ok: true,
    total: rows.length,
    ok_count: ok,
    fail_count: fail,
    byFamily,
    byCorps,
    recent: rows.slice(0, 12),
  };
}

export function verifyReply(reply) {
  const s = String(reply || '').trim();
  if (!s) return { ok: false, reason: 'empty_reply' };
  if (/^❌\s*Mission Control returned empty/i.test(s)) return { ok: false, reason: 'empty_mission' };
  if (/command ['"]?\w+['"]? does not exist/i.test(s)) return { ok: false, reason: 'hallucinated_unknown' };
  return { ok: true, reason: 'ok' };
}

export async function finalizePipeline({ text, reply, ms, stage = 'execute' }) {
  const cls = classifyCommand(text);
  const ver = verifyReply(reply);
  await logPipeline({
    raw_text: text,
    family: cls.family,
    corps: cls.corps,
    stage: ver.ok ? stage : 'verify_fail',
    ok: ver.ok,
    ms,
    detail: ver.ok ? `corps=${cls.corps}` : ver.reason,
  });
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
    '*Agent Lab Pipeline · Wave 12D*\n' +
    'Every founder command runs:\n' +
    '`Gate → Classify → Execute → Verify → Log`\n\n' +
    '• `pipeline help` — this menu\n' +
    '• `pipeline status` — engine online\n' +
    '• `pipeline last` — last logged commands\n' +
    '• `pipeline stats` — family/corps counts\n\n' +
    '_Dashboard: War tab → Lab panel_\n' +
    '_Heavy debate: mission council / think_'
  );
}

export default {
  classifyCommand,
  logPipeline,
  recentPipeline,
  pipelineStats,
  verifyReply,
  finalizePipeline,
  pipelineHelp,
};
