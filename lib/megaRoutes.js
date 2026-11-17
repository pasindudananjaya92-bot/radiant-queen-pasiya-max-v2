/**
 * Wave 24 MEGA — routes: mega help | mega status
 */
import { megaStatus, VERSION } from './megaGuardian.js';

const HELP = `👑 *Mega Pack · ${VERSION}*
Fallthrough Guardian + Dashboard command parity

• \`mega help\` — this menu
• \`mega status\` — one-shot OS pulse (health · deploy · probe · site)

Also protected from LLM fallthrough:
morning · web · lab · qa · god · site · omni · drive · bank · …

Dashboard chat now runs the same command families as Telegram.`;

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (!/^(mega)\b/i.test(lower)) return null;

  if (/^mega\s*(help|\?|$)/i.test(lower)) return HELP;
  if (/^mega\s+status$/i.test(lower) || /^mega\s+pulse$/i.test(lower)) {
    try {
      return await megaStatus();
    } catch (e) {
      return '❌ Mega status: ' + (e.message || e);
    }
  }
  return HELP;
}

export default { tryHandle };
