// lib/toolRegistry.js
// Agent-27 Phase 1 — Tool Registry (add tools here, not in agentExecute)

const TOOLS = {
  health_check: {
    name: 'health_check',
    description: 'Live system health: Vercel, Supabase, Make webhook, Snap, cron keys',
    risk: 'low',
    founder_only: true,
    timeout_ms: 6000,
    args_schema: {},
  },
  doc_ask: {
    name: 'doc_ask',
    description: 'Ask a question against the founder active/recent indexed document (RAG/full text)',
    risk: 'low',
    founder_only: true,
    timeout_ms: 8000,
    args_schema: { question: { type: 'string', required: true } },
  },
  mem_search: {
    name: 'mem_search',
    description: 'Search long-term founder memories/notes',
    risk: 'low',
    founder_only: true,
    timeout_ms: 5000,
    args_schema: { query: { type: 'string', required: true } },
  },
  vault_list: {
    name: 'vault_list',
    description: 'List files in Supabase Storage vault',
    risk: 'low',
    founder_only: true,
    timeout_ms: 5000,
    args_schema: {},
  },
  web_search: {
    name: 'web_search',
    description: 'Search the public web (Tavily→Exa→Brave→Jina). Use for general knowledge not in docs/memories.',
    risk: 'low',
    founder_only: true,
    timeout_ms: 12000,
    args_schema: { query: { type: 'string', required: true } },
  },
};

export function listTools() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    args_schema: t.args_schema,
  }));
}

export function getTool(name) {
  return TOOLS[String(name || '').trim()] || null;
}

export function toolCatalogForPrompt() {
  return listTools()
    .map(
      (t) =>
        `- ${t.name}: ${t.description} | args: ${JSON.stringify(t.args_schema)}`
    )
    .join('\n');
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Tool timeout: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runTool(name, args = {}, ctx = {}) {
  const def = getTool(name);
  if (!def) {
    return {
      type: 'tool_result',
      tool: name,
      ok: false,
      error: 'Unknown tool (not in registry)',
      evidence: [],
    };
  }

  const t0 = Date.now();
  try {
    const data = await withTimeout(executeHandler(def.name, args || {}, ctx), def.timeout_ms, def.name);
    const evidence = Array.isArray(data?.evidence) ? data.evidence : [];
    return {
      type: 'tool_result',
      tool: def.name,
      ok: data?.ok !== false,
      elapsed_ms: Date.now() - t0,
      provider: data?.provider || 'local',
      data: data?.data ?? data,
      error: data?.error || null,
      evidence,
    };
  } catch (e) {
    return {
      type: 'tool_result',
      tool: def.name,
      ok: false,
      elapsed_ms: Date.now() - t0,
      error: e.message || String(e),
      evidence: [],
    };
  }
}

async function executeHandler(name, args, ctx) {
  if (name === 'health_check') {
    try {
      const hm = await import('./healthManager.js');
      const r = await (hm.runFullCheck?.() || hm.default?.runFullCheck?.());
      const checks = r?.checks || [];
      const evidence = checks.map((c) => ({
        claim_hint: `${c.name}: ${c.ok ? 'ok' : 'fail'} (${c.detail})`,
        source_type: 'health',
        source_id: c.name,
        snippet: String(c.detail || ''),
        recency: new Date().toISOString().slice(0, 10),
        raw_score: c.ok ? 85 : 40,
      }));
      return { ok: true, data: r, evidence };
    } catch (e) {
      // minimal fallback probe
      const url = process.env.SUPABASE_URL;
      return {
        ok: Boolean(url),
        data: { note: 'healthManager fallback', supabase: Boolean(url) },
        evidence: [
          {
            claim_hint: 'Supabase env ' + (url ? 'present' : 'missing'),
            source_type: 'health',
            source_id: 'env',
            snippet: url ? 'SUPABASE_URL set' : 'missing',
            raw_score: url ? 70 : 30,
          },
        ],
        error: e.message,
      };
    }
  }

  if (name === 'doc_ask') {
    const question = String(args.question || args.q || '').trim();
    if (!question) return { ok: false, error: 'question required' };
    const dm = await import('./docManager.js');
    const uid = String(ctx.userId || process.env.ADMIN_ID || '');
    const retrieved = await dm.retrieveContext(uid, null, question);
    const ai = await dm.askWithAI(retrieved.context, question, retrieved.doc);
    const ansText = String(ai.text || '');
    const neg =
      /cannot find|can't find|could not find|no (relevant )?info|not (found|mentioned|present)|don'?t know|no evidence|insufficient/i.test(
        ansText
      );
    return {
      ok: !neg,
      provider: ai.provider || 'doc',
      data: {
        answer: ai.text,
        doc: retrieved.doc,
        mode: retrieved.mode,
        usedChunks: retrieved.usedChunks,
        negative: neg,
      },
      evidence: neg
        ? []
        : [
            {
              claim_hint: ansText.slice(0, 240),
              source_type: 'doc',
              source_id: String(retrieved.doc?.id || ''),
              snippet: String(retrieved.context || '').slice(0, 400),
              recency: null,
              raw_score: 90,
            },
          ],
    };
  }

  if (name === 'mem_search') {
    const query = String(args.query || args.q || '').trim();
    if (!query) return { ok: false, error: 'query required' };
    const uid = String(ctx.userId || process.env.ADMIN_ID || '');
    let rows = [];
    try {
      const mm = await import('./memoryManager.js');
      if (mm.search) {
        rows = (await mm.search(uid, query, 8)) || [];
      }
    } catch (_) {}
    if (!rows.length) {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!url || !key) return { ok: false, error: 'Supabase not configured' };
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await sb
        .from('rq_memories')
        .select('id, content, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(30);
      const qLow = query.toLowerCase();
      const tokens = qLow.split(/\s+/).filter((w) => w.length > 2);
      rows = (data || [])
        .map((r) => {
          const c = String(r.content || '').toLowerCase();
          let score = 0;
          if (c.includes(qLow.slice(0, 40))) score += 5;
          for (const t of tokens) if (c.includes(t)) score += 1;
          return { ...r, _score: score };
        })
        .filter((r) => r._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 6);
    }
    const qLow = query.toLowerCase();
    const tokens = qLow.split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
    const evidence = (rows || [])
      .map((r) => ({
        claim_hint: String(r.content).slice(0, 200),
        source_type: 'mem',
        source_id: String(r.id),
        snippet: String(r.content).slice(0, 400),
        recency: r.created_at ? String(r.created_at).slice(0, 10) : null,
        raw_score: 70,
      }))
      .filter((e) => {
        const low = (e.snippet || '').toLowerCase();
        if (!tokens.length) return true;
        return tokens.some((t) => low.includes(t));
      });
    return {
      ok: evidence.length > 0,
      data: { rows: rows.slice(0, 6) },
      evidence,
    };
  }

  if (name === 'vault_list') {
    try {
      const vm = await import('./vaultManager.js');
      const files = await (vm.listFiles?.() || []);
      const evidence = (files || []).slice(0, 10).map((f) => ({
        claim_hint: f.name,
        source_type: 'vault',
        source_id: f.name,
        snippet: f.name + (f.metadata?.size ? ` size=${f.metadata.size}` : ''),
        raw_score: 65,
      }));
      return { ok: true, data: { files: (files || []).slice(0, 30) }, evidence };
    } catch (e) {
      return { ok: false, error: e.message || String(e), evidence: [] };
    }
  }


  if (name === 'web_search') {
    const query = String(args.query || args.q || args.question || '').trim();
    if (!query) return { ok: false, error: 'query required' };
    const { searchWeb } = await import('./webSearch.js');
    const r = await searchWeb(query, { max: 5 });
    if (!r.ok) {
      return {
        ok: false,
        error: r.error || 'search failed',
        data: { tried: r.tried },
        evidence: [],
      };
    }
    const evidence = [];
    if (r.answer) {
      evidence.push({
        claim_hint: String(r.answer).slice(0, 300),
        source_type: 'web',
        source_id: r.provider + ':answer',
        snippet: String(r.answer).slice(0, 500),
        recency: null,
        raw_score: 55,
      });
    }
    for (const h of (r.hits || []).slice(0, 5)) {
      evidence.push({
        claim_hint: String(h.title || h.snippet || '').slice(0, 200),
        source_type: 'web',
        source_id: h.url || r.provider,
        snippet: String(h.snippet || '').slice(0, 400),
        recency: null,
        raw_score: 50,
      });
    }
    return {
      ok: evidence.length > 0,
      provider: r.provider,
      data: { hits: r.hits, answer: r.answer, tried: r.tried },
      evidence,
    };
  }

  return { ok: false, error: 'Handler not implemented' };
}

export default { listTools, getTool, runTool, toolCatalogForPrompt };
