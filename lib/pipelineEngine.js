/**
 * Wave 12C — Command Pipeline (Agent Lab foundation)
 * Every founder command: Gate → Classify → Execute (existing) → Verify → Log
 * Light-weight: no multi-LLM on every message (Vercel Hobby safe).
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Map command prefix → corps + family */
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
    [/^(health|healcheck)\b/, 'watchdog', 'health'],
    [/^(vault|drive)\b/, 'quartermaster', 'storage'],
    [/^(mem|remember|brain)\b/, 'researcher', 'memory'],
    [/^(bank)\b/, 'quartermaster', 'bank'],
    [/^(shadow)\b/, 'scribe', 'shadow'],
    [/^(morning|night)\b/, 'envoy', 'briefing'],
    [/^(make)\b/, 'executor', 'make'],
    [/^(snap)\b/, 'healer', 'snap'],
    [/^(cron)\b/, 'healer', 'cron'],
    [/^(gh|upload)\b/, 'builder', 'github'],
    [/^(mail|email|tts)\b/, 'envoy', 'comms'],
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

export async function recentPipeline(limit = 8) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_pipeline_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

/**
 * Verify outbound reply quality (no LLM)
 */
export function verifyReply(reply) {
  const s = String(reply || '').trim();
  if (!s) return { ok: false, reason: 'empty_reply' };
  if (/^❌\s*Mission Control returned empty/i.test(s)) return { ok: false, reason: 'empty_mission' };
  if (/command ['"]?\w+['"]? does not exist/i.test(s)) return { ok: false, reason: 'hallucinated_unknown' };
  return { ok: true, reason: 'ok' };
}

/**
 * Wrap a handler result with pipeline metadata (for logging)
 */
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
    '*Agent Lab Pipeline · Wave 12C*\n' +
    'Every founder command runs:\n' +
    '`Gate → Classify → Execute → Verify → Log`\n\n' +
    '• `pipeline help` — this menu\n' +
    '• `pipeline status` — engine online\n' +
    '• `pipeline last` — last logged commands\n\n' +
    '_Light mode (no extra LLM per message). Full multi-agent debate = mission council / think._\n' +
    '_Optional SQL: 001_pipeline_log.sql_'
  );
}

export default {
  classifyCommand,
  logPipeline,
  recentPipeline,
  verifyReply,
  finalizePipeline,
  pipelineHelp,
};
