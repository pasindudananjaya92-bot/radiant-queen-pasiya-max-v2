// Dashboard live chat → AI / Evidence Engine + Supabase history
// LONGFORM: >1000 chars or summarize-intent → direct LLM summary (skip tools)
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder').split(/[\s,]+/)[0];
}

export async function saveMessage(row) {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client
    .from('dash_chat_messages')
    .insert({
      user_id: row.user_id || founderId(),
      role: row.role,
      content: row.content,
      tools: row.tools || [],
      trust: row.trust ?? null,
      latency_ms: row.latency_ms ?? null,
      meta: row.meta || {},
    })
    .select('id, created_at')
    .maybeSingle();
  if (error) return { error: error.message };
  return data;
}

export async function listMessages(limit = 40) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase missing', messages: [] };
  const { data, error } = await client
    .from('dash_chat_messages')
    .select('id, role, content, tools, trust, latency_ms, created_at')
    .eq('user_id', founderId())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { ok: false, error: error.message, messages: [] };
  return { ok: true, messages: data || [] };
}

async function logUsage(provider, tool, ok, latency_ms, meta = {}) {
  try {
    const client = sb();
    if (!client) return;
    await client.from('api_usage_logs').insert({
      provider,
      tool,
      ok: !!ok,
      latency_ms,
      meta,
    });
  } catch (_) {}
}

/** Long paste / "summarize this" — never Evidence tools */
export function isLongformDocument(text) {
  const raw = String(text || '');
  const stripped = raw.replace(/^think\s+/i, '').trim();
  if (stripped.length > 1000) {
    // allow only explicit short tool commands at the very start
    if (/^(vault\s+list|health(\s*check)?|mem\s+|doc\s+(ask|analyze))\b/i.test(stripped.slice(0, 80))) {
      return false;
    }
    return true;
  }
  if (
    stripped.length > 200 &&
    /\b(summarize|summarise|summary|key points|මේක කියවලා|මේකේ තියෙන්නේ|කියවලා දෙන්න|සාරාංශ|analyze this|read this)\b/i.test(
      stripped
    )
  ) {
    return true;
  }
  return false;
}

async function directLlmSummary(text) {
  const doc = String(text || '').replace(/^think\s+/i, '').trim().slice(0, 12000);
  const system =
    'The user pasted a long document or note. ' +
    'Summarize in Sinhala AND English. Give exactly 3 key bullet points. ' +
    'Do NOT say "no evidence found". Do NOT use vault, memory, or health tools. ' +
    'Be specific to the pasted content.';

  const ai = await import('./aiRouter.js');
  const ask = ai.chat || ai.complete || ai.ask || ai.generate;
  if (typeof ask !== 'function') {
    throw new Error('AI router unavailable');
  }
  const r = await ask(doc, { system });
  const reply = typeof r === 'string' ? r : r.text || r.content || String(r);
  return reply;
}

/**
 * Handle a dashboard chat message.
 */
export async function handleChat(message) {
  const t0 = Date.now();
  const text = String(message || '').trim();
  if (!text) return { ok: false, error: 'empty message' };

  await saveMessage({ role: 'user', content: text });

  const lower = text.toLowerCase();
  let reply = '';
  let tools = [];
  let trust = null;
  let meta = {};

  try {
    // 1) LONGFORM — skip Evidence Engine entirely
    if (isLongformDocument(text)) {
      try {
        reply = await directLlmSummary(text);
        tools = ['direct_llm_summary'];
        trust = 85;
        meta = { mode: 'longform_summary' };
        await logUsage('groq', 'longform_summary', true, Date.now() - t0, {});
      } catch (e) {
        reply = 'Long-text summary error: ' + (e.message || String(e));
        tools = ['direct_llm_summary'];
        trust = 40;
        meta = { mode: 'longform_error' };
      }
    }
    // 2) Explicit think → Evidence Engine (short questions only; longform already handled)
    else if (lower.startsWith('think ') || lower === 'think') {
      const q = text.replace(/^think\s*/i, '') || 'status';
      try {
        const eng = await import('./evidenceEngine.js');
        const fn = eng.runEvidenceThink || eng.think || eng.runThink;
        if (typeof fn === 'function') {
          const r = await fn(q, { source: 'dashboard' });
          reply = r.answer || r.text || JSON.stringify(r).slice(0, 2000);
          tools = r.tools_used || r.tools || [];
          trust = r.overall_trust ?? r.trust ?? null;
          meta = { mode: 'think', partial: r.partial || false };
          await logUsage('evidence', 'think', true, Date.now() - t0, { tools });
        } else {
          reply = 'Evidence engine loaded but no run function found.';
        }
      } catch (e) {
        reply = 'Think engine error: ' + (e.message || String(e));
        await logUsage('evidence', 'think', false, Date.now() - t0, { error: reply });
      }
    } else {
      // 3) Normal AI chat
      try {
        const ai = await import('./aiRouter.js');
        const ask = ai.chat || ai.complete || ai.ask || ai.generate;
        if (typeof ask === 'function') {
          const r = await ask(text, {
            system:
              'You are Radiant Queen OS dashboard assistant. Be concise. Stack: Vercel, Supabase, Make webhook, Hull B, God Pack, Bank, APK.',
          });
          reply = typeof r === 'string' ? r : r.text || r.content || String(r);
          tools = ['ai_router'];
          trust = 80;
          await logUsage('groq', 'chat', true, Date.now() - t0, {});
        } else {
          throw new Error('no ai function');
        }
      } catch (_) {
        reply =
          'Dashboard chat online.\n' +
          '• Paste long text for auto-summary\n' +
          '• Prefix with `think ` for Evidence Engine (short questions)\n' +
          '• Use Telegram for full bot commands\n\n' +
          'You said: ' +
          text.slice(0, 200);
        tools = ['fallback'];
      }
    }
  } catch (e) {
    reply = 'Chat error: ' + (e.message || String(e));
  }

  const latency_ms = Date.now() - t0;
  const saved = await saveMessage({
    role: 'assistant',
    content: reply,
    tools,
    trust,
    latency_ms,
    meta,
  });

  return {
    ok: true,
    text: reply,
    tools,
    trust,
    latency_ms,
    id: saved?.id || null,
  };
}
