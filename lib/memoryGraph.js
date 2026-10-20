/**
 * lib/memoryGraph.js — Living memory (embed when Gemini available; keyword fallback)
 */

export async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, error: 'no GEMINI_API_KEY' };
  // 2026 embedding model names — try current then fallbacks
  const models = [
    'text-embedding-004',
    'gemini-embedding-001',
    'embedding-001',
  ];
  const content = String(text || '').slice(0, 8000);
  for (const model of models) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':embedContent?key=' +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: content }] },
        }),
      });
      const j = await res.json();
      const values =
        j.embedding?.values ||
        j.embeddings?.[0]?.values ||
        j.data?.[0]?.embedding;
      if (res.ok && values) {
        return { ok: true, embedding: values, model };
      }
    } catch (_) {}
  }
  return { ok: false, error: 'embed failed' };
}

export async function remember(supabase, { userId, content, kind = 'note', meta = {} }) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const body = String(content || '').trim();
  if (!body) return { ok: false, error: 'empty' };

  let embedding = null;
  let embedModel = null;
  const emb = await embedText(body);
  if (emb.ok) {
    embedding = emb.embedding;
    embedModel = emb.model;
  }

  const row = {
    user_id: String(userId || ''),
    kind: String(kind).slice(0, 40),
    content: body.slice(0, 8000),
    meta: { ...meta, embedModel },
  };
  // embedding column optional (vector) — store as jsonb array if vector fails
  if (embedding) {
    row.embedding_json = embedding;
  }

  const { data, error } = await supabase.from('rq_memory_graph').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id, embedded: !!embedding };
}

export async function recall(supabase, { userId, query, limit = 8 }) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const q = String(query || '').trim();

  // Try vector RPC if exists
  if (q) {
    const emb = await embedText(q);
    if (emb.ok) {
      try {
        const { data, error } = await supabase.rpc('rq_memory_search', {
          query_embedding: emb.embedding,
          match_count: limit,
          filter_user: String(userId || ''),
        });
        if (!error && data?.length) {
          return { ok: true, hits: data, mode: 'vector' };
        }
      } catch (_) {}
    }
  }

  // Keyword fallback
  let builder = supabase
    .from('rq_memory_graph')
    .select('id, created_at, kind, content')
    .eq('user_id', String(userId || ''))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (q) builder = builder.ilike('content', '%' + q.replace(/%/g, '') + '%');
  const { data, error } = await builder;
  if (error) return { ok: false, error: error.message };
  return { ok: true, hits: data || [], mode: 'keyword' };
}

export function formatHits(hits, mode) {
  if (!hits?.length) return 'No memories.';
  const lines = ['🧠 Memory (' + mode + ')', ''];
  hits.forEach((h, i) => {
    lines.push(
      i +
        1 +
        '. [' +
        (h.kind || 'note') +
        '] ' +
        String(h.content || h.body || '').slice(0, 160)
    );
  });
  return lines.join('\n').slice(0, 3500);
}

export default { embedText, remember, recall, formatHits };
