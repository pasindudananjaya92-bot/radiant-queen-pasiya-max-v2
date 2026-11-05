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
    return {
      ok: true,
      provider: ai.provider || 'doc',
      data: {
        answer: ai.text,
        doc: retrieved.doc,
        mode: retrieved.mode,
        usedChunks: retrieved.usedChunks,
      },
      evidence: [
        {
          claim_hint: String(ai.text || '').slice(0, 240),
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
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return { ok: false, error: 'Supabase not configured' };
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const uid = String(ctx.userId || process.env.ADMIN_ID || '');
    // Prefer ilike search; fall back to latest rows
    let rows = [];
    const { data, error } = await sb
      .from('rq_memories')
      .select('id, content, created_at')
      .eq('user_id', uid)
      .ilike('content', `%${query.replace(/[%_]/g, '')}%`)
      .order('created_at', { ascending: false })
      .limit(6);
    if (!error && data?.length) rows = data;
    else {
      const { data: d2 } = await sb
        .from('rq_memories')
        .select('id, content, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(6);
      rows = (d2 || []).filter((r) =>
        String(r.content || '').toLowerCase().includes(query.toLowerCase())
      );
      if (!rows.length) rows = d2 || [];
    }
    const evidence = (rows || []).slice(0, 5).map((r) => ({
      claim_hint: String(r.content).slice(0, 200),
      source_type: 'mem',
      source_id: String(r.id),
      snippet: String(r.content).slice(0, 400),
      recency: r.created_at ? String(r.created_at).slice(0, 10) : null,
      raw_score: 70,
    }));
    return { ok: true, data: { rows: rows.slice(0, 6) }, evidence };
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

  return { ok: false, error: 'Handler not implemented' };
}

export default { listTools, getTool, runTool, toolCatalogForPrompt };
