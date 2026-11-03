// lib/vaultRoutes.js
// Agent-21 — Vault Routes
// Version: 2026-11-03

import {
  isConfigured,
  listFiles,
  getSignedUrl,
  deleteFile,
  getInfo,
} from './vaultManager.js';

const HELP = `🗄️ *Vault (Supabase Storage)*

*Commands:*
• \`vault help\` — this menu
• \`vault list\` — list files
• \`vault info\` — bucket stats
• \`vault get <name>\` — get download link
• \`vault delete <name>\` — delete file

*Upload:* Just send a document/photo to the bot in private chat with caption \`vault upload\` or \`vault upload myname.pdf\`

Founder-only. Files stay private.`;

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (!/^(vault)\b/i.test(lower)) return null;

  if (/^vault\s*(help|\?|$)/i.test(lower)) return HELP;

  if (!isConfigured()) {
    return '❌ Vault not configured.\nSet SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel.';
  }

  try {
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

    if (/^vault\s+upload/i.test(lower)) {
      return '📎 Send a file/photo with caption `vault upload` or `vault upload filename.ext`';
    }

    return HELP;
  } catch (err) {
    return `❌ Vault error:\n${err.message || err}`;
  }
}

export default { tryHandle };
