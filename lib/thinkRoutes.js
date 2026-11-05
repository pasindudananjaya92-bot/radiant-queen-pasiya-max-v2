// lib/thinkRoutes.js — Agent-27 Phase 2 commands
import { runEvidenceThink } from './evidenceEngine.js';

const HELP = `🧠 *Evidence Engine (Agent-27 · Phase 2)*

\`think <question>\` — plan → tools → verify → answer
\`think help\` — this menu

*Tools used:* doc_ask · mem_search · health_check · vault_list
*LLM:* Groq → Gemini
*Guard:* soft stop ~8s · reflect×2 · 1h think_cache
*Founder-only*

Examples:
• \`think What was net profit in the finance doc?\`
• \`think Is the system healthy?\`
• \`think What files are in the vault?\`
• \`think Any memories about expansion?\``;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (!/^(think|evidence|reason)\b/i.test(raw)) return null;

  if (/^(think|evidence|reason)\s*(help|\?|$)/i.test(raw)) return HELP;

  if (!isFounder(ctx)) {
    return '👑 Founder-only · Evidence Engine';
  }

  const q = raw.replace(/^(think|evidence|reason)\s+/i, '').trim();
  if (!q) return HELP;

  try {
    const { text: out } = await runEvidenceThink(q, {
      userId: ctx?.from?.id,
      from: ctx?.from,
    });
    return out;
  } catch (e) {
    return '❌ Think failed: ' + (e.message || e);
  }
}

export default { tryHandle };
