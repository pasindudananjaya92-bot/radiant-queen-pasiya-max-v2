// lib/vaultRoutes.js
// Agent-21 — Vault Routes (caption + document aware)
// Version: 2026-11-04

import {
  isConfigured,
  listFiles,
  getSignedUrl,
  deleteFile,
  getInfo,
  uploadBuffer,
} from './vaultManager.js';

const HELP = `🗄️ *Vault (Supabase Storage)*

*Commands:*
• \`vault help\` — this menu
• \`vault list\` — list files
• \`vault info\` — bucket stats
• \`vault get <name>\` — get download link
• \`vault delete <name>\` — delete file

*Upload:*
Send a document or photo in private chat with caption:
\`vault upload\`
or
\`vault upload my-filename.ext\`

Founder-only. Files stay private.`;

function getCaptionOrText(ctx, text) {
  return String(
    text ||
    ctx?.message?.caption ||
    ctx?.message?.text ||
    ctx?.update?.message?.caption ||
    ctx?.update?.message?.text ||
    ''
  ).trim();
}

export async function tryHandle(text = '', ctx = null) {
  const raw = getCaptionOrText(ctx, text);
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (!/^(vault)\b/i.test(lower)) return null;

  if (/^vault\s*(help|\?|$)/i.test(lower)) return HELP;

  if (!isConfigured()) {
    return '❌ Vault not configured.\nSet SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel.';
  }

  try {
    if (/^vault\s+upload\b/i.test(lower)) {
      const msg = ctx?.message || ctx?.update?.message;
      const doc = msg?.document || (msg?.photo ? msg.photo[msg.photo.length - 1] : null);
      if (!doc) {
        return '📎 Send a **document or photo** with caption `vault upload` (or `vault upload filename.ext`).';
      }

      let filename = 'file';
      const nameMatch = raw.match(/^vault\s+upload\s+(.+)$/i);
      if (nameMatch) {
        filename = nameMatch[1].trim().replace(/[\/\\]/g, '_').slice(0, 120);
      } else if (msg.document?.file_name) {
        filename = msg.document.file_name.replace(/[\/\\]/g, '_').slice(0, 120);
      } else if (msg.photo) {
        filename = `photo_${Date.now()}.jpg`;
      }

      if (!ctx?.telegram && !ctx?.tg) {
        return '❌ Cannot access Telegram file API in this context.';
      }
      const tg = ctx.telegram || ctx.tg;
      const fileId = doc.file_id;
      const fileLink = await tg.getFileLink(fileId);
      const res = await fetch(fileLink.href || fileLink);
      if (!res.ok) throw new Error(`Telegram file download failed (${res.status})`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const contentType = msg.document?.mime_type || 'application/octet-stream';

      await uploadBuffer(filename, buffer, contentType);
      return `✅ Uploaded to vault:\n\`${filename}\`\nSize: ${Math.round(buffer.length / 1024)} KB`;
    }

    if (/^vault\s+list$/i.test(lower)) {
      const files = await listFiles();
      if (!files.length) return '📂 Vault is empty.';
      const lines = files.slice(0, 30).map((f, i) => {
        const size = f.metadata?.size ? ` (${Math.round(f.metadata.size / 1024)} KB)` : '';
        return `${i + 1}. \`${f.name}\`${size}`;
      });
      return `📂 *Vault files* (${files.length})\n\n${lines.join('\n')}`;
    }

    if (/^vault\s+info$/i.test(lower)) {
      const info = await getInfo();
      return `🗄️ *Vault Info*\n\nBucket: \`${info.bucket}\`\nFiles: ${info.files}\nApprox size: ${Math.round(info.approxBytes / 1024)} KB`;
    }

    const getMatch = lower.match(/^vault\s+get\s+(.+)$/i);
    if (getMatch) {
      const name = getMatch[1].trim().replace(/^[`"]|[`"]$/g, '');
      const url = await getSignedUrl(name, 3600);
      if (!url) return `❌ File not found: \`${name}\``;
      return `🔗 *Download* (1 hour)\n\n\`${name}\`\n\n${url}`;
    }

    const delMatch = lower.match(/^vault\s+(delete|rm|remove)\s+(.+)$/i);
    if (delMatch) {
      const name = delMatch[2].trim().replace(/^[`"]|[`"]$/g, '');
      await deleteFile(name);
      return `🗑️ Deleted: \`${name}\``;
    }

    return HELP;
  } catch (err) {
    return `❌ Vault error:\n${err.message || err}`;
  }
}

export default { tryHandle };
