// lib/memoryRoutes.js
// Agent-22 — Memory Brain Routes
// Version: 2026-11-03

import {
  isConfigured,
  remember,
  search,
  listRecent,
  forget,
  stats,
} from './memoryManager.js';

const HELP = `🧠 *Memory Brain*

*Commands:*
• \`mem help\` — this menu
• \`mem remember <text>\` — save a memory
• \`mem search <query>\` — search memories
• \`mem list\` — recent memories
• \`mem stats\` — how many memories
• \`mem forget <id>\` — delete one memory

Examples:
\`mem remember Client X prefers email on Mondays\`
\`mem search Client X\``;

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (!/^(mem|memory|brain)\b/i.test(lower)) return null;

  if (/^(mem|memory|brain)\s*(help|\?|$)/i.test(lower)) return HELP;

  if (!isConfigured()) {
    return '❌ Memory not configured.\nSet SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and run the SQL in docs.';
  }

  const uid = String(ctx?.from?.id || 'founder');

  try {
    if (/^(mem|memory|brain)\s+list$/i.test(lower)) {
      const rows = await listRecent(uid, 10);
      if (!rows.length) return '🧠 No memories yet. Use `mem remember ...`';
      const lines = rows.map((r, i) => {
        const preview = String(r.content).slice(0, 80).replace(/\n/g, ' ');
        return `${i + 1}. #${r.id} — ${preview}`;
      });
      return `🧠 *Recent memories*\n\n${lines.join('\n')}`;
    }

    if (/^(mem|memory|brain)\s+stats$/i.test(lower)) {
      const s = await stats(uid);
      return `🧠 *Memory stats*\n\nTotal memories: ${s.count}`;
    }

    const rem = raw.match(/^(?:mem|memory|brain)\s+remember\s+(.+)$/is);
    if (rem) {
      const content = rem[1].trim();
      if (content.length < 3) return 'Please provide more text to remember.';
      const row = await remember(uid, content);
      return `✅ Remembered (#${row.id})\n\n${content.slice(0, 200)}`;
    }

    const sch = raw.match(/^(?:mem|memory|brain)\s+search\s+(.+)$/is);
    if (sch) {
      const q = sch[1].trim();
      const rows = await search(uid, q, 5);
      if (!rows.length) return `🧠 No matches for: ${q}`;
      const lines = rows.map((r, i) => {
        const preview = String(r.content).slice(0, 100).replace(/\n/g, ' ');
        return `${i + 1}. #${r.id} — ${preview}`;
      });
      return `🧠 *Search results*\n\n${lines.join('\n')}`;
    }

    const del = lower.match(/^(?:mem|memory|brain)\s+forget\s+(\d+)$/i);
    if (del) {
      await forget(uid, del[1]);
      return `🗑️ Memory #${del[1]} forgotten.`;
    }

    return HELP;
  } catch (err) {
    return `❌ Memory error:\n${err.message || err}`;
  }
}

export default { tryHandle };
