
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isDeployText(text = '') {
  const t = String(text || '').trim().replace(/^\//, '');
  return /^(deploy|guardian)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !isDeployText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();
  const mod = await import('./deployGuardian.js');

  if (/^(deploy|guardian)\s+help$/i.test(lower) || /^deploy$/i.test(lower)) {
    return mod.deployHelp();
  }
  if (/^(deploy)\s+(check|status|scan|budget)$/i.test(lower) || /^guardian\s+check$/i.test(lower)) {
    const r = await mod.runDeployCheck();
    return mod.formatDeployCheck(r);
  }
  return mod.deployHelp();
}

export default { tryHandle, isDeployText };
