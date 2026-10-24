/**
 * /debug — error paste → diagnosis (v3000 Code Bug God Mode entry)
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export async function handleDebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').replace(/^\/debug(@\w+)?\s*/i, '').trim();
  if (!raw || raw === 'help') {
    return (
      '🛠 DEBUG · Code Bug God Mode\n' +
      '1) /debug <paste error or stack>\n' +
      '2) /architect failed /cmd <note> — autonomous fix loop\n' +
      '3) /expect /cmd :: must include X — train contracts\n' +
      '4) gh path/file.js — self-healing upload\n\n' +
      'Example:\n/debug SyntaxError: Unexpected token at lib/echoX.js:42'
    );
  }
  if (/^fix\b/i.test(raw)) {
    return 'Use: /architect failed /echo <what went wrong>';
  }
  const r = await powerChat(
    'You are PasiyaOS staff engineer. Stack: Telegraf bot, Vercel serverless, Supabase, GitHub API.\n' +
      'Diagnose this error. Output:\n' +
      '1) Likely file(s) under lib/ or api/\n' +
      '2) Root cause (1-3 bullets)\n' +
      '3) Surgical fix steps\n' +
      '4) Exact test commands after fix\n\nERROR:\n' +
      raw.slice(0, 7000),
    {
      system: 'Concise. Prefer surgical lib/ patches. No full-file rewrites unless required.',
      maxTokens: 1400,
      temperature: 0.15,
    }
  );
  if (!r.ok) return 'Debug failed: ' + (r.error || 'AI');
  return '🛠 DEBUG · ' + r.engine + '\n\n' + r.text;
}

export default { handleDebug };
