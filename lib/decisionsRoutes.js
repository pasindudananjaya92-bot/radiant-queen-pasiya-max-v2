/**
 * Wave 27A — decide* routes
 */
import * as eng from './decisionsEngine.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(decide|decision|decisions)\b/i.test(lower)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  try {
    if (/^(decide|decision|decisions)(\s+help|\s+\?|\s*$)/i.test(lower)) {
      return eng.decisionsHelp();
    }
    if (/^decide\s+status$/i.test(lower)) {
      const s = eng.decisionsStatus();
      return [
        `⚖ *Decisions status · ${eng.VERSION}*`,
        `Key: ${s.has_key ? '✅' : '❌'} · Flag: ${s.enabled_flag ? 'ON' : 'OFF'}`,
        `Circuit: ${s.circuit_open ? '🔒 OPEN (auto-OFF)' : '✅ closed'}`,
        s.circuit_open_until ? `Until: ${s.circuit_open_until}` : '',
        s.last_error ? `Last error: ${s.last_error}` : 'Last error: —',
        `Model: ${s.model} · calls(instance): ${s.calls_this_instance}`,
        '',
        '_Free tier only. Quota → auto-OFF. No billing upgrade._',
      ]
        .filter(Boolean)
        .join('\n');
    }

    let m = raw.match(/^decide\s+check\s+([\s\S]+)$/i);
    if (m) {
      const r = await eng.checkText(m[1].trim());
      return eng.formatCheckResult(r);
    }
    m = raw.match(/^decide\s+route\s+([\s\S]+)$/i);
    if (m) {
      const r = await eng.routeText(m[1].trim());
      return eng.formatRouteResult(r);
    }
    m = raw.match(/^decide\s+score\s+([\s\S]+)$/i);
    if (m) {
      const r = await eng.scoreText(m[1].trim());
      return eng.formatScoreResult(r);
    }

    return eng.decisionsHelp();
  } catch (e) {
    return '❌ Decide: ' + (e.message || e);
  }
}

export default { tryHandle };
