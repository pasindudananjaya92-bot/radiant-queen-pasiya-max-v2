// lib/docRoutes.js — Agent-25 Document Analyst routes
// Version: 2026-11-05

import {
  isConfigured,
  extractTextFromBuffer,
  saveDocument,
  listDocuments,
  setActiveDoc,
  getActiveDocId,
  retrieveContext,
  askWithAI,
  deleteDocument,
} from './docManager.js';

const HELP = `📄 *Document Analyst (Agent-25)*

*Upload & index*
Send a PDF / DOCX / TXT with caption:
\`doc analyze\`
or \`doc analyze My Report\`

*Commands*
• \`doc help\` — this menu
• \`doc list\` — your documents
• \`doc use <id>\` — set active document
• \`doc ask <question>\` — ask about active doc
• \`doc summary\` — summarize active doc
• \`doc delete <id>\` — remove document

*Tips*
• Large PDFs use RAG (top chunks). Small docs use full text.
• After analyze, ask via text or *voice*: "doc ask what is the total?"
• Also works: caption \`analyze\` on a file.`;

function captionOrText(ctx, text) {
  return String(
    text ||
      ctx?.message?.caption ||
      ctx?.message?.text ||
      ctx?.update?.message?.caption ||
      ''
  ).trim();
}

export async function tryHandle(text = '', ctx = null) {
  const raw = captionOrText(ctx, text);
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // trigger words
  if (!/^(doc|docs|document|analyze)\b/i.test(lower) && !/^analyze\b/i.test(lower)) {
    return null;
  }

  if (/^(doc|docs|document)\s*(help|\?|$)/i.test(lower)) return HELP;

  if (!isConfigured()) {
    return '❌ Doc analyst needs Supabase.\nSet SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and run sql/001_documents.sql';
  }

  const uid = String(ctx?.from?.id || 'founder');

  try {
    // list
    if (/^(doc|docs|document)\s+list$/i.test(lower)) {
      const rows = await listDocuments(uid);
      if (!rows.length) return '📂 No documents yet.\nSend a PDF/TXT with caption `doc analyze`.';
      const active = await getActiveDocId(uid);
      const lines = rows.map((r, i) => {
        const mark = r.id === active ? '👉' : '•';
        const kb = Math.round((r.char_count || 0) / 1000);
        return `${mark} #${r.id} ${r.title || r.filename} · ${kb}k chars · ${r.kind || '?'}`;
      });
      return `📄 *Your documents*\n\n${lines.join('\n')}\n\nUse: \`doc use <id>\` then \`doc ask ...\``;
    }

    // use
    const useM = lower.match(/^(?:doc|docs|document)\s+use\s+(\d+)$/i);
    if (useM) {
      await setActiveDoc(uid, useM[1]);
      return `✅ Active document set to #${useM[1]}`;
    }

    // delete
    const delM = lower.match(/^(?:doc|docs|document)\s+(?:delete|rm|remove)\s+(\d+)$/i);
    if (delM) {
      await deleteDocument(uid, delM[1]);
      return `🗑️ Deleted document #${delM[1]}`;
    }

    // summary
    if (/^(?:doc|docs|document)\s+summary$/i.test(lower)) {
      const retrieved = await retrieveContext(uid, null, 'summary overview main points');
      const ai = await askWithAI(
        retrieved.context,
        'Provide a clear structured summary with key points, numbers, and action items if any.',
        retrieved.doc
      );
      return `📄 *Summary* — ${retrieved.doc.title || retrieved.doc.filename}\n_mode: ${retrieved.mode}, chunks: ${retrieved.usedChunks}_\n\n${ai.text}`;
    }

    // ask
    const askM = raw.match(/^(?:doc|docs|document)\s+ask\s+(.+)$/is);
    if (askM) {
      const question = askM[1].trim();
      const retrieved = await retrieveContext(uid, null, question);
      const ai = await askWithAI(retrieved.context, question, retrieved.doc);
      return `📄 *Answer* — ${retrieved.doc.title || '#' + retrieved.doc.id}\n_mode: ${retrieved.mode}_\n\n${ai.text}`;
    }

    // analyze (from caption on document/photo)
    if (/^(?:doc|docs|document)\s+analyze\b/i.test(lower) || /^analyze\b/i.test(lower)) {
      const msg = ctx?.message || ctx?.update?.message;
      const doc = msg?.document;
      if (!doc) {
        return '📎 Send a *PDF / DOCX / TXT file* with caption:\n`doc analyze`\nor\n`doc analyze Report Name`';
      }

      const titleMatch = raw.match(/^(?:doc|docs|document)\s+analyze\s+(.+)$/i) ||
        raw.match(/^analyze\s+(.+)$/i);
      const title = titleMatch ? titleMatch[1].trim() : doc.file_name || 'document';

      if (doc.file_size && doc.file_size > 8_000_000) {
        return '❌ File too large (max ~8MB for analysis).';
      }

      const tg = ctx.telegram || ctx.tg;
      if (!tg) return '❌ Telegram file API unavailable.';

      await ctx.sendChatAction?.('typing');
      const fileLink = await tg.getFileLink(doc.file_id);
      const res = await fetch(fileLink.href || fileLink);
      if (!res.ok) throw new Error('Download failed HTTP ' + res.status);
      const buffer = Buffer.from(await res.arrayBuffer());

      const extracted = await extractTextFromBuffer(
        buffer,
        doc.file_name || title,
        doc.mime_type || ''
      );
      const saved = await saveDocument({
        uid,
        title,
        filename: doc.file_name || title,
        mime: doc.mime_type || '',
        text: extracted.text,
        kind: extracted.kind,
        pages: extracted.pages,
      });

      // auto short summary
      let summary = '';
      try {
        const retrieved = await retrieveContext(uid, saved.doc.id, 'summary key points');
        const ai = await askWithAI(
          retrieved.context,
          'Summarize in 6-10 short bullet points. Include important names, dates, amounts.',
          retrieved.doc
        );
        summary = ai.text;
      } catch (e) {
        summary = '(Summary skipped: ' + (e.message || e) + ')';
      }

      return (
        `✅ *Document indexed*\n` +
        `#${saved.doc.id} — ${saved.doc.title}\n` +
        `Chars: ${saved.doc.char_count} · Chunks: ${saved.chunks} · Type: ${extracted.kind}\n\n` +
        `*Auto summary:*\n${summary}\n\n` +
        `Ask: \`doc ask <your question>\``
      );
    }

    return HELP;
  } catch (err) {
    return `❌ Doc error:\n${err.message || err}`;
  }
}

export default { tryHandle };
