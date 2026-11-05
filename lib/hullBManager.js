// lib/hullBManager.js
// Agent-27 Phase 3 — Hull B queue (FIXED claim + diagnostics)
// Worker: /api/cron?job=thinkworker&secret=...  OR bot: think worker

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer service role — required to bypass RLS on think_jobs
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function usingServiceRole() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function tgSend(chatId, text) {
  const token = process.env.BOT_TOKEN || '';
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

export function shouldBackground(question, flags = {}) {
  if (flags.forceBg) return true;
  if (flags.forceSync) return false;
  if (String(process.env.THINK_ALWAYS_BG || '') === '1') return true;
  const q = String(question || '');
  if (q.length > 180) return true;
  if ((q.match(/\?/g) || []).length >= 2) return true;
  if (/\b(and|also|then|compare|analyze|full|deep|step by step)\b/i.test(q)) return true;
  return false;
}

export async function enqueueThinkJob({ userId, chatId, prompt }) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('think_jobs')
    .insert({
      user_id: String(userId),
      chat_id: String(chatId || userId),
      prompt: String(prompt).slice(0, 8000),
      status: 'queued',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, status, created_at')
    .single();

  if (error) {
    throw new Error(
      error.message +
        (!usingServiceRole()
          ? ' (HINT: set SUPABASE_SERVICE_ROLE_KEY — anon key is blocked by RLS)'
          : '')
    );
  }
  return data;
}

/**
 * Claim next queued job.
 * Uses select-then-update; if RLS blocks update, surfaces error.
 */
export async function claimNextJob() {
  const client = sb();
  if (!client) return { job: null, error: 'no supabase client' };

  // 1) Find oldest queued
  const { data: jobs, error: selErr } = await client
    .from('think_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(5);

  if (selErr) {
    return {
      job: null,
      error:
        'select queued failed: ' +
        selErr.message +
        (!usingServiceRole() ? ' | need SUPABASE_SERVICE_ROLE_KEY' : ' | check RLS/SQL'),
    };
  }
  if (!jobs?.length) return { job: null, error: null, empty: true };

  // 2) Try claim each until one succeeds (handles races)
  for (const job of jobs) {
    const { data: claimed, error: upErr } = await client
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

    if (upErr) {
      return {
        job: null,
        error:
          'update claim failed: ' +
          upErr.message +
          (!usingServiceRole() ? ' | need SUPABASE_SERVICE_ROLE_KEY' : ''),
      };
    }
    if (claimed) return { job: claimed, error: null };
  }

  return { job: null, error: null, empty: true };
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

export async function processOneThinkJob() {
  const claim = await claimNextJob();
  if (claim.error) {
    return { ok: false, empty: false, error: claim.error };
  }
  if (!claim.job) {
    return { ok: true, empty: true, message: 'no queued jobs' };
  }

  const job = claim.job;
  try {
    const { runEvidenceThink } = await import('./evidenceEngine.js');
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
    return { ok: true, jobId: job.id, dm: send.ok, empty: false };
  } catch (e) {
    const msg = e.message || String(e);
    await completeJob(job.id, { ok: false, error: msg });
    await tgSend(job.chat_id, `❌ *Hull B failed* · job #${job.id}\n${msg.slice(0, 500)}`);
    return { ok: false, jobId: job.id, error: msg, empty: false };
  }
}

export async function processThinkQueue(max = 1) {
  const results = [];
  for (let i = 0; i < max; i++) {
    const r = await processOneThinkJob();
    results.push(r);
    if (r.empty || r.error) break;
  }
  return results;
}

/** Diagnostics for stuck queues */
export async function queueDiagnostics() {
  const client = sb();
  const lines = [];
  lines.push('🛠 *Hull B diagnostics*');
  lines.push(`Service role key: ${usingServiceRole() ? 'YES' : 'NO ❌'}`);
  if (!client) {
    lines.push('Supabase client: NO');
    return lines.join('\n');
  }
  lines.push('Supabase client: YES');

  try {
    const { data, error, count } = await client
      .from('think_jobs')
      .select('id, status, prompt, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      lines.push('Read error: ' + error.message);
      lines.push('→ Run sql/003b_think_jobs_rls_fix.sql');
    } else {
      lines.push(`Rows visible: ${count ?? data?.length ?? 0}`);
      for (const j of data || []) {
        lines.push(`#${j.id} ${j.status} · ${String(j.prompt).slice(0, 40)}`);
      }
    }
  } catch (e) {
    lines.push('Exception: ' + (e.message || e));
  }
  return lines.join('\n');
}

export default {
  shouldBackground,
  enqueueThinkJob,
  processOneThinkJob,
  processThinkQueue,
  queueDiagnostics,
  tgSend,
};
