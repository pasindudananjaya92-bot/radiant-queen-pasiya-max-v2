/**
 * Wave 24 MEGA — routes: mega help | mega status
 * CRITICAL: once prefix matches, NEVER return null (null = AI fallthrough)
 */
import { megaStatus, VERSION } from './megaGuardian.js';

const HELP = [
  '👑 *Mega Pack · ' + VERSION + '*',
  'Fallthrough Guardian + Dashboard command parity',
  '',
  '• `mega help` — this menu',
  '• `mega status` — one-shot OS pulse (health · deploy · probe · site)',
  '',
  'Also protected: morning · web · lab · qa · god · site · omni · drive · bank',
  'Dashboard chat uses the same command families as Telegram.',
].join('\n');

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(mega)\b/i.test(lower)) return null;

  try {
    if (/^mega(\s+help|\s+\?|\s*$)/i.test(lower) || lower === 'mega') {
      return HELP;
    }
    if (/^mega\s+(status|pulse|stat)\b/i.test(lower)) {
      return await megaStatus();
    }
    return HELP + '\n\n_Unknown subcommand. Try `mega status`._';
  } catch (e) {
    return '❌ Mega: ' + (e && e.message ? e.message : e);
  }
}

export default { tryHandle };
