/**
 * v4000 C3 — PDF/text RAG on Supabase pgvector
 * /docadd (caption on document) · /docask · /doclist · /docdel
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const c = sb();
  if (!c) throw new Error('Supabase not configured');
  const res = await fetch(c.url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + c.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch (_) {
    j = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      (j && (j.message || j.error || j.hint || j.raw)) || 'SB ' + res.status
    );
  }
  return j;
}

async function embedTexts(texts) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing for embeddings');
  // gemini-embedding-001 — text only, Matryoshka; request 768 dims
  const model =
    process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const out = [];
  for (const t of texts) {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':embedContent?key=' +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: String(t).slice(0, 8000) }] },
        outputDimensionality: 768,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        j.error?.message || j.message || 'embed ' + res.status
      );
    }
    const values =
      j.embedding?.values ||
      j.embeddings?.[0]?.values ||
      null;
    if (!values || !values.length) {
      throw new Error('empty embedding');
    }
    // pad/truncate to 768
    let v = values.slice(0, 768);
    while (v.length < 768) v.push(0);
    out.push(v);
  }
  return out;
}

function chunkText(text, size, overlap) {
  const s = size || 900;
  const o = overlap || 120;
  const clean = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!clean) return [];
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + s));
    i += s - o;
    if (chunks.length >= 40) break; // safety per doc on free tier
  }
  return chunks;
}

async function extractPdfText(buffer) {
  // Prefer Gemini file understanding for PDF bytes (small docs)
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY required for PDF extract');
  const b64 = buffer.toString('base64');
  // limit ~4MB base64 payload safety
  if (b64.length > 5_500_000) {
    throw new Error('PDF too large (max ~4MB). Split the file.');
  }
  const model = process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash';
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: b64,
              },
            },
            {
              text:
                'Extract ALL readable text from this PDF in reading order. ' +
                'No commentary. Plain text only.',
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(55000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(j.error?.message || 'PDF extract ' + res.status);
  }
  const text =
    j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
    '';
  if (!text.trim()) throw new Error('No text extracted from PDF');
  return text.trim();
}

export async function addDocumentFromText({
  title,
  source,
  ownerId,
  text,
}) {
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('No text to index');

  const docs = await sbFetch('rq_documents', {
    method: 'POST',
    body: JSON.stringify({
      owner_id: String(ownerId || ADMIN()),
      title: String(title || 'Untitled').slice(0, 200),
      source: String(source || '').slice(0, 300),
      chunk_count: chunks.length,
    }),
  });
  const doc = Array.isArray(docs) ? docs[0] : docs;
  if (!doc?.id) throw new Error('Failed to create document row');

  // embed in small batches
  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3);
    const vectors = await embedTexts(batch);
    const rows = batch.map((content, j) => ({
      doc_id: doc.id,
      chunk_ix: i + j,
      content,
      embedding: vectors[j],
    }));
    await sbFetch('rq_doc_chunks', {
      method: 'POST',
      body: JSON.stringify(rows),
      prefer: 'return=minimal',
    });
  }
  return { docId: doc.id, chunks: chunks.length, title: doc.title };
}

export async function addDocumentFromPdfBuffer({
  title,
  source,
  ownerId,
  buffer,
}) {
  const text = await extractPdfText(buffer);
  return addDocumentFromText({ title, source, ownerId, text });
}

export async function listDocuments(ownerId, limit = 15) {
  const q =
    'rq_documents?owner_id=eq.' +
    encodeURIComponent(String(ownerId || ADMIN())) +
    '&order=created_at.desc&limit=' +
    limit +
    '&select=id,title,chunk_count,created_at,source';
  const rows = await sbFetch(q);
  return Array.isArray(rows) ? rows : [];
}

export async function deleteDocument(docId, ownerId) {
  // chunks cascade if FK set; else delete chunks first
  await sbFetch('rq_doc_chunks?doc_id=eq.' + encodeURIComponent(docId), {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
  await sbFetch(
    'rq_documents?id=eq.' +
      encodeURIComponent(docId) +
      '&owner_id=eq.' +
      encodeURIComponent(String(ownerId || ADMIN())),
    { method: 'DELETE', prefer: 'return=minimal' }
  );
  return true;
}

async function powerChatSafe(prompt, opts) {
  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (!fn) return { ok: false, error: 'powerChat missing' };
    return await fn(prompt, opts || {});
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function askDocuments(question, ownerId) {
  const [qVec] = await embedTexts([question]);
  // RPC match_doc_chunks preferred; fallback: fetch recent chunks (weak)
  const c = sb();
  let matches = [];
  try {
    const res = await fetch(c.url + '/rest/v1/rpc/match_doc_chunks', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + c.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: qVec,
        match_count: 6,
        owner_filter: String(ownerId || ADMIN()),
      }),
    });
    const j = await res.json().catch(() => []);
    if (res.ok && Array.isArray(j)) matches = j;
    else throw new Error(j.message || 'rpc failed');
  } catch (e) {
    // keyword fallback
    const rows = await sbFetch(
      'rq_doc_chunks?select=id,doc_id,chunk_ix,content&content=ilike.*' +
        encodeURIComponent(String(question).slice(0, 40).replace(/[%_]/g, '')) +
        '*&limit=6'
    );
    matches = Array.isArray(rows) ? rows : [];
    if (!matches.length) {
      return {
        ok: false,
        error:
          'No matching chunks. Run sql/V4000_DOC_RAG.sql (RPC). Detail: ' +
          (e.message || e),
      };
    }
  }

  const sources = matches
    .map(function (m, i) {
      return (
        '[' +
        (i + 1) +
        '] (doc ' +
        String(m.doc_id || '').slice(0, 8) +
        ')\n' +
        String(m.content || '').slice(0, 700)
      );
    })
    .join('\n\n');

  const r = await powerChatSafe(
    'QUESTION:\n' +
      question +
      '\n\nDOCUMENT EXCERPTS:\n' +
      sources +
      '\n\nAnswer using only excerpts. Cite [n]. If unknown, say so.',
    {
      system: 'PasiyaOS Doc RAG. Cite [n]. Concise.',
      maxTokens: 1000,
      temperature: 0.15,
    }
  );
  if (!r.ok) {
    return {
      ok: true,
      text: 'Excerpts only (LLM fail):\n\n' + sources.slice(0, 3500),
    };
  }
  return {
    ok: true,
    text:
      String(r.text || '').trim() +
      '\n\n——\n📄 doc-rag · matches=' +
      matches.length +
      ' · llm=' +
      (r.engine || ''),
  };
}

/**
 * Telegram handlers
 */
export async function handleDocCommand({ text, ctx, bot }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const uid = String(ctx.from.id);

  if (/^\/doclist(?:@\w+)?$/i.test(raw)) {
    const rows = await listDocuments(uid);
    if (!rows.length) return 'No documents. Send a PDF with caption /docadd';
    return (
      '📚 DOCUMENTS\n' +
      rows
        .map(
          (r, i) =>
            i +
            1 +
            '. `' +
            String(r.id).slice(0, 8) +
            '` · ' +
            (r.title || '') +
            ' · chunks=' +
            (r.chunk_count || 0)
        )
        .join('\n')
    );
  }

  const del = raw.match(/^\/docdel(?:@\w+)?\s+(\S+)/i);
  if (del) {
    await deleteDocument(del[1], uid);
    return '🗑 Deleted doc ' + del[1].slice(0, 8);
  }

  const ask = raw.match(/^\/docask(?:@\w+)?\s+([\s\S]+)/i);
  if (ask) {
    const out = await askDocuments(ask[1].trim(), uid);
    if (!out.ok) return '❌ ' + out.error;
    return out.text.slice(0, 4000);
  }

  if (/^\/docadd(?:@\w+)?/i.test(raw)) {
    return 'Send a PDF or .txt as Document with caption:\n/docadd My Title';
  }

  if (/^\/doc(?:@\w+)?(?:\s+help)?$/i.test(raw)) {
    return (
      '📄 DOC RAG · v4000 C3\n\n' +
      '1. Send PDF/TXT with caption: /docadd Report Title\n' +
      '2. /docask <question>\n' +
      '3. /doclist · /docdel <id>\n\n' +
      'SQL: sql/V4000_DOC_RAG.sql\n' +
      'Embed: GEMINI_API_KEY (gemini-embedding-001 @ 768d)'
    );
  }

  return null;
}

/** Call from document message handler */
export async function handleDocUpload({ ctx, bot, fileBuffer, fileName, caption }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) {
    return '👑 Founder-only.';
  }
  const cap = String(caption || '');
  if (!/\/docadd\b/i.test(cap)) {
    return null; // not a docadd
  }
  const title =
    cap.replace(/\/docadd(?:@\w+)?\s*/i, '').trim() ||
    fileName ||
    'Untitled';
  const lower = String(fileName || '').toLowerCase();
  let result;
  if (lower.endsWith('.pdf')) {
    result = await addDocumentFromPdfBuffer({
      title,
      source: fileName,
      ownerId: String(ctx.from.id),
      buffer: fileBuffer,
    });
  } else {
    const text = fileBuffer.toString('utf8');
    result = await addDocumentFromText({
      title,
      source: fileName,
      ownerId: String(ctx.from.id),
      text,
    });
  }
  return (
    '✅ Indexed **' +
    result.title +
    '**\n' +
    'id=`' +
    String(result.docId).slice(0, 8) +
    '` · chunks=' +
    result.chunks +
    '\nTry: /docask <question>'
  );
}

export default {
  handleDocCommand,
  handleDocUpload,
  askDocuments,
  listDocuments,
};
