
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isOmniText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(omni|omnMind|omnimind)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isOmniText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./omniEngine.js');
  const lower = raw.toLowerCase();

  if (/^(omni|omnimind)\s+help$/i.test(lower) || /^(omni|omnimind)$/i.test(lower)) {
    return eng.omniHelp();
  }
  if (/^(omni|omnimind)\s+status$/i.test(lower)) {
    const s = await eng.omniStatus();
    return (
      '👑 *OMNI Status · ' +
      s.phase +
      '*\nCore: ✅\nSnap auto: ' +
      (s.snap_auto ? 'ON' : 'OFF') +
      '\nRules: ' +
      s.rules
    );
  }
  if (/^(omni|omnimind)\s+predict$/i.test(lower)) {
    return eng.formatPredict(await eng.runPredict());
  }
  if (/^(omni|omnimind)\s+heal$/i.test(lower)) {
    return eng.formatHeal(await eng.runOmniHeal({ notify: false }));
  }
  if (/^(omni|omnimind)\s+shadow$/i.test(lower)) {
    const r = await eng.runOmniShadow({ notify: false });
    return r.body;
  }
  if (/^(omni|omnimind)\s+pulse$/i.test(lower)) {
    const r = await eng.runOmniPulse({ notify: false });
    return r.body;
  }
  return '❓ Try `omni help`';
}

export default { tryHandle, isOmniText };
