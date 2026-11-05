// lib/thinkRoutes.js — Phase 3 + manual worker + diagnostics
import { createClient } from '@supabase/supabase-js';
import { runEvidenceThink } from './evidenceEngine.js';
import {
  shouldBackground,
  enqueueThinkJob,
  processThinkQueue,
  queueDiagnostics,
} from './hullBManager.js';

const HELP = `🧠 *Evidence Engine + Hull B*

\`think <q>\` · \`think bg <q>\` · \`think sync <q>\`
\`think worker\` / \`think runjobs\` — process queue NOW (manual)
\`think diag\` — queue / RLS diagnostics
\`think jobs\` · \`think last\` · \`think help\`

Founder-only.`;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function lastTrace(userId) {
  const client = sb();
  if (!client) return '❌ Supabase not configured';
  const { data, error } = await client
    .from('think_traces')
    .select('id, prompt, status, overall_trust, retries, elapsed_ms, created_at')
    .eq('user_id', String(userId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return '❌ ' + error.message;
  if (!data) return 'No traces yet.';
  return `🧠 *Last think*\n#${data.id} · ${data.status} · trust ${data.overall_trust}\nQ: ${String(data.prompt).slice(0, 200)}\n${data.elapsed_ms}ms · ${data.created_at}`;
}

async function listJobs(userId) {
  const client = sb();
  if (!client) return '❌ Supabase not configured';
  const { data, error } = await client
    .from('think_jobs')
    .select('id, status, prompt, created_at, error')
    .eq('user_id', String(userId))
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) return '❌ ' + error.message + '\nRun sql/003b_think_jobs_rls_fix.sql';
  if (!data?.length) return 'No Hull B jobs yet.';
  return (
    '🛠 *Hull B jobs*\n' +
    data
      .map(
        (j) =>
          `#${j.id} · *${j.status}* · ${String(j.prompt).slice(0, 42)}…` +
          (j.error ? `\n   err: ${String(j.error).slice(0, 80)}` : '') +
          `\n   ${j.created_at}`
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
  if (/^(think|evidence|reason)\s+(diag|diagnostics|doctor)$/i.test(raw)) {
    return queueDiagnostics();
  }

  // MANUAL WORKER — process queue immediately (no cron wait)
  if (/^(think|evidence|reason)\s+(worker|runjobs|run\s*jobs|process)$/i.test(raw)) {
    try {
      const results = await processThinkQueue(3);
      if (!results.length) return 'Worker: no results';
      const lines = results.map((r, i) => {
        if (r.empty) return `${i + 1}. queue empty`;
        if (r.error) return `${i + 1}. ERROR: ${r.error}`;
        return `${i + 1}. job #${r.jobId} · ok=${r.ok} · dm=${r.dm}`;
      });
      return `⚙️ *Hull B worker (manual)*\n` + lines.join('\n');
    } catch (e) {
      return '❌ Worker failed: ' + (e.message || e);
    }
  }

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

  if (shouldBackground(q, { forceBg, forceSync })) {
    try {
      const job = await enqueueThinkJob({ userId: uid, chatId, prompt: q });
      return (
        `🧠 *Thinking in background (Hull B)*\n` +
        `Job #${job.id}\n` +
        `I will DM you when done.\n\n` +
        `_Run now:_ \`think worker\`\n` +
        `_Or wait for cron:_ job=thinkworker`
      );
    } catch (e) {
      try {
        const { text: out } = await runEvidenceThink(q, { userId: uid, from: ctx?.from });
        return out + `\n\n_(Queue failed: ${e.message}. Ran sync.)_`;
      } catch (e2) {
        return '❌ Think failed: ' + (e2.message || e2);
      }
    }
  }

  try {
    const { text: out } = await runEvidenceThink(q, { userId: uid, from: ctx?.from });
    return out;
  } catch (e) {
    return '❌ Think failed: ' + (e.message || e);
  }
}

export default { tryHandle };
