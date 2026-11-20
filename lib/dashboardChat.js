// Dashboard chat — command parity with Telegram + longform + think + AI
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

export function isLongformDocument(text) {
  const raw = String(text || '');
  const stripped = raw.replace(/^think\s+/i, '').trim();
  if (stripped.length > 1000) {
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

/**
 * Same chain as think engine uses in practice: aiRouter.routeTextAI
 */
async function callRouteTextAI(system, user) {
  const ai = await import('./aiRouter.js');
  if (typeof ai.routeTextAI !== 'function') {
    throw new Error('AI is busy, try again in 1 min (routeTextAI missing)');
  }
  const r = await ai.routeTextAI({ system, user });
  const text = typeof r === 'string' ? r : r?.text || r?.content || '';
  const provider = typeof r === 'object' && r?.provider ? r.provider : 'ai';
  if (!String(text).trim()) {
    throw new Error('AI is busy, try again in 1 min (empty response)');
  }
  return { text: String(text).trim(), provider };
}

async function directLlmSummary(text) {
  const doc = String(text || '').replace(/^think\s+/i, '').trim().slice(0, 12000);
  const system =
    'Summarize this long text and give the top 3 key points. ' +
    'Reply in Sinhala AND English. Use clear bullets for the 3 key points. ' +
    'Do NOT say "no evidence found". Do NOT mention vault, memory, or health tools. ' +
    'Be specific to the pasted content only.';
  return callRouteTextAI(system, doc);
}

/** Fake ctx so Telegram-style routers accept Dashboard chat */
function dashCtx() {
  const id = founderId();
  return {
    from: { id },
    chat: { id, type: 'private' },
    message: { from: { id }, chat: { id, type: 'private' } },
  };
}

/**
 * Route OS commands the same way Telegram does (best-effort).
 * Returns string reply or null if not a known command family.
 */
async function tryOsCommand(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const ctx = dashCtx();

  try {
    const mg = await import('./megaGuardian.js');
    if (!mg.looksLikeOsCommand(raw)) return null;
  } catch (_) {
    // if guardian missing, still try common prefixes
    if (!/^(lab|qa|morning|web|mega|god|site|health|drive|bank|omni|think)\b/i.test(raw)) {
      return null;
    }
  }

  const chain = [
    ['./leadsRoutes.js', 'tryHandle'],
    ['./wikiRoutes.js', 'tryHandle'],
    ['./architectRoutes.js', 'tryHandle'],
    ['./codeForgeRoutes.js', 'tryHandle'],
    ['./visionRoutes.js', 'tryHandle'],
    ['./decisionsRoutes.js', 'tryHandle'],
    ['./megaRoutes.js', 'tryHandle'],
    ['./godRoutes.js', 'tryHandle'],
    ['./webMasterRoutes.js', 'tryHandle'],
    ['./platformRoutes.js', 'tryHandle'],
    ['./labRoutes.js', 'tryHandle'],
    ['./qaRoutes.js', 'tryHandle'],
    ['./omniRoutes.js', 'tryHandle'],
    ['./missionRoutes.js', 'tryHandle'],
    ['./healerRoutes.js', 'tryHandle'],
    ['./thinkRoutes.js', 'tryHandle'],
    ['./healthRoutes.js', 'tryHandle'],
  ];

  for (const [mod, fn] of chain) {
    try {
      const m = await import(mod);
      if (typeof m[fn] === 'function') {
        const out = await m[fn](raw, ctx);
        if (out != null && out !== '') return String(out);
      }
      if (typeof m.tryHandle === 'function' && fn !== 'tryHandle') {
        const out = await m.tryHandle(raw, ctx);
        if (out != null && out !== '') return String(out);
      }
    } catch (_) {}
  }

  // Last resort: full agentExecute (founder private)
  try {
    const { tryAgentExecute } = await import('./agentExecute.js');
    const out = await tryAgentExecute({ text: raw, ctx });
    if (out != null && out !== '') return String(out);
  } catch (_) {}

  try {
    const mg = await import('./megaGuardian.js');
    return mg.fallthroughMessage(raw);
  } catch (_) {
    return '🛡 Command not handled. Try Telegram or `mega help`.';
  }
}

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
    // 1) OS commands first (Dashboard ↔ Telegram parity)
    const cmdOut = await tryOsCommand(text);
    if (cmdOut) {
      reply = cmdOut;
      tools = ['os_command'];
      trust = 90;
      meta = { mode: 'os_command' };
      await logUsage('os', 'dashboard_cmd', true, Date.now() - t0, {});
    } else if (isLongformDocument(text)) {
      try {
        const { text: summary, provider } = await directLlmSummary(text);
        reply = summary;
        tools = ['direct_llm_summary', provider];
        trust = 85;
        meta = { mode: 'longform_summary', provider };
        await logUsage(provider || 'groq', 'longform_summary', true, Date.now() - t0, {});
      } catch (e) {
        const msg = e.message || String(e);
        reply =
          msg.includes('busy') || msg.includes('No AI')
            ? 'AI is busy, try again in 1 min.'
            : 'Long-text summary error: ' + msg;
        tools = ['direct_llm_summary'];
        trust = 40;
        meta = { mode: 'longform_error', error: msg };
        await logUsage('ai', 'longform_summary', false, Date.now() - t0, { error: msg });
      }
    } else if (lower.startsWith('think ') || lower === 'think') {
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
      try {
        const { text: out, provider } = await callRouteTextAI(
          'You are Radiant Queen OS dashboard assistant. Be concise and accurate. Stack: Vercel, Supabase, Make webhook, Hull B, God Pack, Bank, APK, Drive.',
          text
        );
        reply = out;
        tools = ['ai_router', provider];
        trust = 80;
        meta = { mode: 'chat', provider };
        await logUsage(provider || 'groq', 'chat', true, Date.now() - t0, {});
      } catch (e) {
        const msg = e.message || String(e);
        reply =
          msg.includes('busy') || msg.includes('No AI')
            ? 'AI is busy, try again in 1 min.'
            : 'Chat AI error: ' + msg;
        tools = ['ai_router'];
        trust = 40;
        await logUsage('ai', 'chat', false, Date.now() - t0, { error: msg });
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
