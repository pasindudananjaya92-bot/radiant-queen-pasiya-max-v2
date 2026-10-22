/**
 * Neural Memory / RAG Vault — semantic + keyword memory
 * Free: Gemini text-embedding-004 when key present; keyword fallback always
 * Table: rq_neural_memory (see sql/NEURAL_MEMORY.sql)
 */
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';

export async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const input = String(text || '').slice(0, 8000);
  if (!key || !input) return { ok: false, vector: null, error: key ? 'empty text' : 'no GEMINI_API_KEY' };
  try {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      EMBED_MODEL +
      ':embedContent?key=' +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: input }] },
      }),
    });
    const j = await res.json();
    const values = j?.embedding?.values || j?.embeddings?.[0]?.values;
    if (!values || !values.length) {
      return { ok: false, vector: null, error: j?.error?.message || 'no embedding' };
    }
    return { ok: true, vector: values };
  } catch (e) {
    return { ok: false, vector: null, error: String(e.message || e) };
  }
}

export async function neuralRemember(supabase, { text, tags = [], userId = '' }) {
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) return { ok: false, error: 'empty memory text' };
  const emb = await embedText(body);
  const row = {
    body,
    tags: Array.isArray(tags) ? tags : String(tags || '').split(',').map((s) => s.trim()).filter(Boolean),
    user_id: String(userId || ''),
    embedding: emb.ok ? emb.vector : null,
    has_vector: !!emb.ok,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('rq_neural_memory').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id, embedded: !!emb.ok, embedError: emb.ok ? null : emb.error };
}

export async function neuralRecall(supabase, query, limit = 5) {
  const q = String(query || '').trim().slice(0, 500);
  if (!q) return { ok: false, error: 'empty query' };

  // Try vector RPC if available
  const emb = await embedText(q);
  if (emb.ok && emb.vector) {
    try {
      const { data, error } = await supabase.rpc('rq_neural_search', {
        query_embedding: emb.vector,
        match_count: limit,
      });
      if (!error && data && data.length) {
        return {
          ok: true,
          mode: 'vector',
          hits: data.map((r) => ({
            id: r.id,
            body: r.body,
            tags: r.tags,
            score: r.similarity,
          })),
        };
      }
    } catch (_) {
      /* fall through to keyword */
    }
  }

  // Keyword fallback (always works)
  const { data, error } = await supabase
    .from('rq_neural_memory')
    .select('id,body,tags,created_at')
    .ilike('body', '%' + q.replace(/%/g, '') + '%')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    mode: 'keyword',
    hits: (data || []).map((r) => ({
      id: r.id,
      body: r.body,
      tags: r.tags,
      score: null,
    })),
  };
}

export async function neuralList(supabase, limit = 10) {
  const { data, error } = await supabase
    .from('rq_neural_memory')
    .select('id,body,tags,has_vector,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export function formatNeuralRecall(r) {
  if (!r.ok) return '❌ Neural: ' + r.error + '\nRun sql/NEURAL_MEMORY.sql';
  const lines = ['🧠 NEURAL MEMORY (' + (r.mode || '') + ')', ''];
  const hits = r.hits || [];
  if (!hits.length) lines.push('(no hits)');
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    lines.push(
      i +
        1 +
        '. ' +
        String(h.body || '').slice(0, 200) +
        (h.score != null ? ' · sim=' + Number(h.score).toFixed(3) : '')
    );
  }
  return lines.join('\n').slice(0, 3500);
}

export function formatNeuralList(r) {
  if (!r.ok) return '❌ ' + r.error;
  const lines = ['🧠 NEURAL VAULT (recent)', ''];
  for (const row of r.rows || []) {
    lines.push(
      '• ' +
        String(row.id).slice(0, 8) +
        (row.has_vector ? ' [vec]' : ' [kw]') +
        ' ' +
        String(row.body || '').slice(0, 100)
    );
  }
  if (!(r.rows || []).length) lines.push('(empty) — /neuralmemory add <text>');
  return lines.join('\n').slice(0, 3500);
}

export default {
  embedText,
  neuralRemember,
  neuralRecall,
  neuralList,
  formatNeuralRecall,
  formatNeuralList,
};
