function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isCodeSwarmText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(codeswarm|codeswarm|codeheal|fixswarm)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isCodeSwarmText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./codeSwarmEngine.js');
  const lower = raw.toLowerCase();

  if (
    /^(codeswarm|codeheal|fixswarm)\s+help$/i.test(lower) ||
    /^(codeswarm|codeheal|fixswarm)$/i.test(lower)
  ) {
    const st = await eng.swarmStatus();
    return st.report;
  }

  if (/^(codeswarm|codeheal|fixswarm)\s+status$/i.test(lower)) {
    const st = await eng.swarmStatus();
    return st.report + '\n_Foundation online. Auto-push healer expands in 12B._';
  }

  const tri = raw.match(/^(?:codeswarm|codeheal|fixswarm)\s+triage\s+([\s\S]+)$/i);
  if (tri) {
    const t = eng.triageError(tri[1], '');
    return (
      `🔎 *Triage*\n` +
      `Kind: *${t.kind}*\n` +
      `Line: ${t.line ?? '?'}\n` +
      `${t.message}`
    );
  }

  return '❓ Try `codeswarm help`';
}

export default { tryHandle, isCodeSwarmText };
