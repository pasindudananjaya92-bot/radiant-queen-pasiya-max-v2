// lib/thinkRoutes.js — Agent-27 Phase 2 + think last (Phase 3 lite)
import { createClient } from '@supabase/supabase-js';
import { runEvidenceThink } from './evidenceEngine.js';

const HELP = `🧠 *Evidence Engine (Agent-27)*

\`think <question>\` — plan → tools → verify → answer
\`think last\` — last reasoning trace summary
\`think help\` — this menu

*Tools (intent-gated):* doc_ask · mem_search · health_check · vault_list
*LLM:* Groq → Gemini · *Cache:* 1h · *Reflect:* ×2
*Guard:* ~8s soft stop · partial with no evidence = LOW

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
    .select('id, prompt, status, overall_trust, retries, providers, elapsed_ms, steps, created_at')
    .eq('user_id', String(userId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return '❌ ' + error.message;
  if (!data) return 'No traces yet.';
  const tools = [];
  try {
    const steps = data.steps || [];
    for (const s of steps) {
      if (s.tool && !s.skipped) tools.push(s.tool);
    }
  } catch (_) {}
  return (
    `🧠 *Last think*\n` +
    `#${data.id} · ${data.status} · trust ${data.overall_trust}\n` +
    `Q: ${String(data.prompt).slice(0, 200)}\n` +
    `tools: ${tools.join(', ') || '—'} · retries ${data.retries} · ${data.elapsed_ms}ms\n` +
    `providers: ${JSON.stringify(data.providers || [])}\n` +
    `${data.created_at}`
  );
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (!/^(think|evidence|reason)\b/i.test(raw)) return null;

  if (/^(think|evidence|reason)\s*(help|\?|$)/i.test(raw)) return HELP;
  if (!isFounder(ctx)) return '👑 Founder-only · Evidence Engine';

  if (/^(think|evidence|reason)\s+last$/i.test(raw)) {
    return lastTrace(ctx?.from?.id || process.env.ADMIN_ID);
  }

  const q = raw.replace(/^(think|evidence|reason)\s+/i, '').trim();
  if (!q) return HELP;

  try {
    const { text: out } = await runEvidenceThink(q, {
      userId: ctx?.from?.id,
      from: ctx?.from,
    });
    return out;
  } catch (e) {
    return '❌ Think failed: ' + (e.message || e);
  }
}

export default { tryHandle };
