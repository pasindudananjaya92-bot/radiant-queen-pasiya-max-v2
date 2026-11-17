
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}
export function isDeployText(text = '') {
  return /^(deploy|guardian)\b/i.test(String(text || '').trim().replace(/^\//, ''));
}
export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !isDeployText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
  const mod = await import('./deployGuardian.js');
  const lower = raw.toLowerCase();
  if (/^(deploy|guardian)(\s+help)?$/i.test(lower)) return mod.deployHelp();
  if (/^deploy\s+(check|status|scan|budget)$/i.test(lower)) {
    return mod.formatDeployCheck(await mod.runDeployCheck());
  }
  return mod.deployHelp();
}
export default { tryHandle, isDeployText };
