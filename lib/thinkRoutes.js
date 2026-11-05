// lib/thinkRoutes.js — Agent-27 Phase 3 (Hull B aware)
import { createClient } from '@supabase/supabase-js';
import { runEvidenceThink } from './evidenceEngine.js';
import {
  shouldBackground,
  enqueueThinkJob,
} from './hullBManager.js';

const HELP = `🧠 *Evidence Engine + Hull B (Agent-27 · P3)*

\`think <question>\` — sync (fast) or auto background if complex
\`think bg <question>\` — force Hull B background
\`think sync <question>\` — force immediate answer
\`think last\` — last trace
\`think jobs\` — recent Hull B jobs
\`think help\`

*Hull B:* queues job → worker cron/Make processes → DM when done
Founder-only.`;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

async function lastTrace(userId) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return '❌ Supabase not configured';
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from('think_traces')
    .select('id, prompt, status, overall_trust, retries, providers, elapsed_ms, created_at')
    .eq('user_id', String(userId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return '❌ ' + error.message;
  if (!data) return 'No traces yet.';
  return (
    `🧠 *Last think*\n#${data.id} · ${data.status} · trust ${data.overall_trust}\n` +
    `Q: ${String(data.prompt).slice(0, 200)}\n` +
    `retries ${data.retries} · ${data.elapsed_ms}ms\n${data.created_at}`
  );
}

async function listJobs(userId) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return '❌ Supabase not configured';
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from('think_jobs')
    .select('id, status, prompt, created_at, finished_at')
    .eq('user_id', String(userId))
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) return '❌ ' + error.message + '\n(Run sql/003_think_jobs.sql?)';
  if (!data?.length) return 'No Hull B jobs yet.';
  return (
    '🛠 *Hull B jobs*\n' +
    data
      .map(
        (j) =>
          `#${j.id} · ${j.status} · ${String(j.prompt).slice(0, 40)}…\n   ${j.created_at}`
      )
      .join('\n')
  );
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (!/^(think|evidence|reason)\b/i.test(raw)) return null;

  if (/^(think|evidence|reason)\s*(help|\?|$)/i.test(raw)) return HELP;
  if (!isFounder(ctx)) return '👑 Founder-only · Evidence Engine';

  const uid = ctx?.from?.id || process.env.ADMIN_ID;
  const chatId = ctx?.chat?.id || uid;

  if (/^(think|evidence|reason)\s+last$/i.test(raw)) return lastTrace(uid);
  if (/^(think|evidence|reason)\s+jobs$/i.test(raw)) return listJobs(uid);

  let forceBg = false;
  let forceSync = false;
  let q = raw.replace(/^(think|evidence|reason)\s+/i, '').trim();

  if (/^bg\s+/i.test(q)) {
    forceBg = true;
    q = q.replace(/^bg\s+/i, '').trim();
  } else if (/^sync\s+/i.test(q)) {
    forceSync = true;
    q = q.replace(/^sync\s+/i, '').trim();
  }

  if (!q) return HELP;

  // Hull B path
  if (shouldBackground(q, { forceBg, forceSync })) {
    try {
      const job = await enqueueThinkJob({ userId: uid, chatId, prompt: q });
      return (
        `🧠 *Thinking in background (Hull B)*\n` +
        `Job #${job.id}\n` +
        `I will DM you when done.\n\n` +
        `_Worker: cron/Make → /api/cron?job=thinkworker_\n` +
        `_Tip: \`think sync ${q.slice(0, 40)}\` for immediate attempt_`
      );
    } catch (e) {
      // Fallback to sync if queue table missing
      try {
        const { text: out } = await runEvidenceThink(q, { userId: uid, from: ctx?.from });
        return (
          out +
          `\n\n_(Hull B queue unavailable: ${e.message}. Ran sync instead.)_`
        );
      } catch (e2) {
        return '❌ Think failed: ' + (e2.message || e2);
      }
    }
  }

  // Sync path
  try {
    const { text: out } = await runEvidenceThink(q, {
      userId: uid,
      from: ctx?.from,
    });
    return out;
  } catch (e) {
    return '❌ Think failed: ' + (e.message || e);
  }
}

export default { tryHandle };
