/**
 * /debug — paste an error → AI points file + fix plan (no auto-push unless founder confirms)
 * /debug SyntaxError: Unexpected token ...
 * /debugfix :: confirm  → optional later hook to architect
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || '').trim();

export async function handleDebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').replace(/^\/debug(@\w+)?\s*/i, '').trim();
  if (!raw || raw === 'help') {
    return (
      '🛠 DEBUG LITE (v3000)\n' +
      'Paste any error:\n/debug <stack or message>\n\n' +
      'Then optionally:\n/architect failed /cmd <note>\n/gh path after fix'
    );
  }
  if (raw.toLowerCase().startsWith('fix')) {
    return 'Use /architect failed /cmd <description> for autonomous god-loop fix.';
  }
  const r = await powerChat(
    'PasiyaOS Telegram bot on Vercel/Supabase. Diagnose this error. ' +
      'Name likely file under lib/ or api/, root cause, exact fix steps (surgical).\n\n' +
      raw.slice(0, 6000),
    {
      system: 'Senior platform engineer. Concise bullets. Prefer lib/ surgical patches.',
      maxTokens: 1200,
      temperature: 0.2,
    }
  );
  if (!r.ok) return 'Debug AI fail: ' + (r.error || '');
  return '🛠 DEBUG · ' + r.engine + '\n\n' + r.text;
}

export default { handleDebug };
