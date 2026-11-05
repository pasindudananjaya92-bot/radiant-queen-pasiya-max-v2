// lib/docManager.js
// Agent-25 — AI Document Analyst (hybrid RAG)
// Version: 2026-11-05
// Strategy:
//  - Extract text (pdf-parse / mammoth / utf8)
//  - Chunk + store in Supabase (rq_documents, rq_doc_chunks)
//  - Small docs: full text to AI
//  - Large docs: keyword/overlap retrieval of top chunks → AI

import { createClient } from '@supabase/supabase-js';

const MAX_CHARS_STORE = 120000;
const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_FOR_ASK = 8;
const FULL_CONTEXT_LIMIT = 14000; // if doc smaller, send full text

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isConfigured() {
  try {
    getSupabase();
    return true;
  } catch {
    return false;
  }
}

export function chunkText(text) {
  const clean = String(text || '').replace(/\r/g, '').trim();
  if (!clean) return [];
  const chunks = [];
  let i = 0;
  while (i < clean.length && chunks.length < 200) {
    const end = Math.min(clean.length, i + CHUNK_SIZE);
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = end - CHUNK_OVERLAP;
    if (i < 0) i = 0;
  }
  return chunks;
}

export async function extractTextFromBuffer(buffer, filename = '', mime = '') {
  const name = String(filename || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // TXT / MD / JSON / CSV
  if (
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.csv') ||
    name.endsWith('.json') ||
    name.endsWith('.log') ||
    m.startsWith('text/')
  ) {
    let t = buf.toString('utf8');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    return { text: t.slice(0, MAX_CHARS_STORE), kind: 'text' };
  }

  // PDF
  if (name.endsWith('.pdf') || m.includes('pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buf);
    return {
      text: String(data.text || '').slice(0, MAX_CHARS_STORE),
      kind: 'pdf',
      pages: data.numpages || null,
    };
  }

  // DOCX
  if (name.endsWith('.docx') || m.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return {
      text: String(result.value || '').slice(0, MAX_CHARS_STORE),
      kind: 'docx',
    };
  }

  // Fallback: try utf8
  let t = buf.toString('utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  // Heuristic: if too many weird chars, reject
  const sample = t.slice(0, 2000);
  const bad = (sample.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || []).length;
  if (bad > 20) {
    throw new Error('Unsupported file type. Use PDF, DOCX, or TXT.');
  }
  return { text: t.slice(0, MAX_CHARS_STORE), kind: 'text-fallback' };
}

export async function saveDocument({ uid, title, filename, mime, text, kind, pages }) {
  const sb = getSupabase();
  const body = String(text || '').trim();
  if (body.length < 20) throw new Error('Not enough text extracted from file.');

  const { data: doc, error } = await sb
    .from('rq_documents')
    .insert({
      user_id: String(uid),
      title: String(title || filename || 'document').slice(0, 200),
      filename: String(filename || '').slice(0, 200),
      mime: String(mime || '').slice(0, 120),
      kind: kind || 'unknown',
      pages: pages || null,
      char_count: body.length,
      preview: body.slice(0, 400),
    })
    .select('id, title, char_count')
    .single();
  if (error) throw error;

  const chunks = chunkText(body);
  const rows = chunks.map((content, idx) => ({
    doc_id: doc.id,
    user_id: String(uid),
    chunk_index: idx,
    content,
  }));

  // insert in batches
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error: cErr } = await sb.from('rq_doc_chunks').insert(batch);
    if (cErr) throw cErr;
  }

  // remember active doc for user
  try {
    await sb.from('rq_doc_active').upsert({
      user_id: String(uid),
      doc_id: doc.id,
      updated_at: new Date().toISOString(),
    });
  } catch (_) {
    // table optional if SQL partially applied
  }

  return { doc, chunks: chunks.length, text: body };
}

export async function listDocuments(uid, limit = 15) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('rq_documents')
    .select('id, title, filename, char_count, pages, kind, created_at')
    .eq('user_id', String(uid))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function setActiveDoc(uid, docId) {
  const sb = getSupabase();
  const { error } = await sb.from('rq_doc_active').upsert({
    user_id: String(uid),
    doc_id: Number(docId),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
}

export async function getActiveDocId(uid) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('rq_doc_active')
    .select('doc_id')
    .eq('user_id', String(uid))
    .maybeSingle();
  if (error) return null;
  return data?.doc_id || null;
}

function scoreChunk(content, query) {
  const q = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
  if (!q.length) return 0;
  const c = content.toLowerCase();
  let score = 0;
  for (const w of q) {
    if (c.includes(w)) score += 2;
    // light frequency
    let idx = 0;
    while ((idx = c.indexOf(w, idx)) !== -1) {
      score += 1;
      idx += w.length;
    }
  }
  return score;
}

export async function retrieveContext(uid, docId, question) {
  const sb = getSupabase();
  const id = docId || (await getActiveDocId(uid));
  if (!id) throw new Error('No active document. Upload with caption `doc analyze` or `doc use <id>`.');

  const { data: doc, error: dErr } = await sb
    .from('rq_documents')
    .select('id, title, filename, char_count')
    .eq('id', id)
    .eq('user_id', String(uid))
    .single();
  if (dErr || !doc) throw new Error('Document not found.');

  const { data: chunks, error: cErr } = await sb
    .from('rq_doc_chunks')
    .select('chunk_index, content')
    .eq('doc_id', id)
    .eq('user_id', String(uid))
    .order('chunk_index', { ascending: true });
  if (cErr) throw cErr;

  const list = chunks || [];
  if (!list.length) throw new Error('Document has no chunks.');

  const full = list.map((c) => c.content).join('\n');
  // Small doc → full text
  if (full.length <= FULL_CONTEXT_LIMIT) {
    return {
      doc,
      mode: 'full',
      context: full.slice(0, FULL_CONTEXT_LIMIT),
      usedChunks: list.length,
    };
  }

  // Large → rank chunks
  const ranked = list
    .map((c) => ({ ...c, score: scoreChunk(c.content, question) }))
    .sort((a, b) => b.score - a.score || a.chunk_index - b.chunk_index);

  const top = [];
  const seen = new Set();
  // always include first chunk (title/intro)
  if (list[0]) {
    top.push(list[0]);
    seen.add(list[0].chunk_index);
  }
  for (const c of ranked) {
    if (top.length >= MAX_CHUNKS_FOR_ASK) break;
    if (seen.has(c.chunk_index)) continue;
    if (c.score === 0 && top.length >= 4) continue;
    top.push(c);
    seen.add(c.chunk_index);
  }
  top.sort((a, b) => a.chunk_index - b.chunk_index);

  const context = top
    .map((c) => `[chunk ${c.chunk_index}]\n${c.content}`)
    .join('\n\n')
    .slice(0, FULL_CONTEXT_LIMIT + 4000);

  return {
    doc,
    mode: 'rag',
    context,
    usedChunks: top.length,
    totalChunks: list.length,
  };
}

export async function askWithAI(contextBlock, question, docMeta) {
  const system = `You are a precise document analyst for Pasiya Max Queen bot.
Answer ONLY using the document context below. If the answer is not in the context, say you cannot find it in the document.
Be concise. Use the user's language (Sinhala or English).
Document: ${docMeta?.title || docMeta?.filename || 'doc'} (id ${docMeta?.id})`;

  const user = `QUESTION:\n${question}\n\nDOCUMENT CONTEXT:\n${contextBlock}`;

  // Prefer existing multi-provider router
  try {
    const { routeTextAI } = await import('./aiRouter.js');
    const r = await routeTextAI({ system, user });
    if (r?.text) return { text: r.text, provider: r.provider || 'router' };
  } catch (_) {}

  // Groq fallback
  const key = process.env.GROQ_API_KEY || '';
  if (!key) throw new Error('No AI provider (aiRouter/GROQ_API_KEY).');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL?.split(',')[0] || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'AI HTTP ' + res.status);
  const text = data?.choices?.[0]?.message?.content || '';
  return { text, provider: 'groq' };
}

export async function deleteDocument(uid, docId) {
  const sb = getSupabase();
  await sb.from('rq_doc_chunks').delete().eq('doc_id', docId).eq('user_id', String(uid));
  await sb.from('rq_documents').delete().eq('id', docId).eq('user_id', String(uid));
  return true;
}
