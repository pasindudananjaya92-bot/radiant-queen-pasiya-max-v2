// lib/hullBManager.js
// Agent-27 Phase 3 — Hull B background think queue (Supabase + cron/Make worker)
// No separate Render/Railway required. Worker = /api/cron?job=thinkworker&secret=...

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function botToken() {
  return process.env.BOT_TOKEN || '';
}

export async function tgSend(chatId, text) {
  const token = botToken();
  if (!token || !chatId) return { ok: false, error: 'no token/chat' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 3900),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, error: j.description };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Heuristic: should this think run in background? */
export function shouldBackground(question, flags = {}) {
  if (flags.forceBg) return true;
  if (flags.forceSync) return false;
  if (String(process.env.THINK_ALWAYS_BG || '') === '1') return true;
  const q = String(question || '');
  // Long / multi-part questions
  if (q.length > 180) return true;
  if ((q.match(/\?/g) || []).length >= 2) return true;
  if (/\b(and|also|then|compare|analyze|full|deep|step by step|විස්තර|සම්පූර්ණ)\b/i.test(q)) {
    return true;
  }
  return false;
}

export async function enqueueThinkJob({ userId, chatId, prompt }) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured for Hull B queue');

  const row = {
    user_id: String(userId),
    chat_id: String(chatId || userId),
    prompt: String(prompt).slice(0, 8000),
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('think_jobs')
    .insert(row)
    .select('id, status, created_at')
    .single();

  if (error) throw error;
  return data;
}

/** Claim oldest queued job (simple lock via status flip) */
export async function claimNextJob() {
  const client = sb();
  if (!client) return null;

  const { data: jobs, error } = await client
    .from('think_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !jobs?.length) return null;
  const job = jobs[0];

  const { data: claimed, error: e2 } = await client
    .from('think_jobs')
    .update({
      status: 'running',
      updated_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();

  // Another worker may have claimed it
  if (e2 || !claimed) return null;
  return claimed;
}

export async function completeJob(id, { ok, resultText, error, envelope }) {
  const client = sb();
  if (!client) return;
  await client
    .from('think_jobs')
    .update({
      status: ok ? 'done' : 'failed',
      result_text: resultText ? String(resultText).slice(0, 8000) : null,
      error: error ? String(error).slice(0, 2000) : null,
      envelope: envelope || null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

/**
 * Process one queued job: run evidence engine, DM founder.
 * Called from /api/cron?job=thinkworker
 */
export async function processOneThinkJob() {
  const job = await claimNextJob();
  if (!job) return { ok: true, empty: true, message: 'no queued jobs' };

  try {
    const { runEvidenceThink } = await import('./evidenceEngine.js');
    // Background runs still on Vercel limits; engine soft-guard applies.
    // Future: multi-tick state machine can raise depth without single-request timeout.
    const { text, envelope } = await runEvidenceThink(job.prompt, {
      userId: job.user_id,
      from: { id: job.user_id },
      hullB: true,
    });

    const header = `🧠 *Hull B complete* · job #${job.id}\n_Q: ${String(job.prompt).slice(0, 120)}_\n\n`;
    const body = header + String(text || '').slice(0, 3600);
    const send = await tgSend(job.chat_id, body);
    await completeJob(job.id, {
      ok: true,
      resultText: text,
      envelope: { ...envelope, dm: send },
    });
    return { ok: true, jobId: job.id, dm: send.ok };
  } catch (e) {
    const msg = e.message || String(e);
    await completeJob(job.id, { ok: false, error: msg });
    await tgSend(
      job.chat_id,
      `❌ *Hull B failed* · job #${job.id}\n${msg.slice(0, 500)}`
    );
    return { ok: false, jobId: job.id, error: msg };
  }
}

/** Process up to N jobs per worker tick */
export async function processThinkQueue(max = 1) {
  const results = [];
  for (let i = 0; i < max; i++) {
    const r = await processOneThinkJob();
    results.push(r);
    if (r.empty) break;
  }
  return results;
}

export async function getJob(id) {
  const client = sb();
  if (!client) return null;
  const { data } = await client.from('think_jobs').select('*').eq('id', id).maybeSingle();
  return data;
}

export default {
  shouldBackground,
  enqueueThinkJob,
  processOneThinkJob,
  processThinkQueue,
  tgSend,
};
