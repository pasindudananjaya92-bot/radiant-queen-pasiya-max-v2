/**
 * Deploy Guardian routes · patched 37-S4.1
 * deploy gate / advice / dgate → Deploy Gatekeeper (never old help menu only)
 */
export function isDeployText(text = '') {
  return /^(deploy|guardian|dgate)\b/i.test(String(text || '').trim().replace(/^\//, ''));
}

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
  if (!raw || !isDeployText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  // Gatekeeper path — MUST win for gate/advice/dgate
  if (
    /^(dgate)\b/i.test(lower) ||
    /^deploy\s+(gate|advice|gatekeeper)\b/i.test(lower)
  ) {
    try {
      const gateRoutes = await import('./deployGateRoutes.js');
      const out = await (gateRoutes.tryHandle || gateRoutes.tryDeployGateHandle)(raw, ctx);
      if (out != null && out !== '') return out;
    } catch (e) {
      return '❌ DeployGate: ' + (e?.message || e);
    }
  }

  const mod = await import('./deployGuardian.js');
  if (/^(deploy|guardian)(\s+help)?$/i.test(lower)) return mod.deployHelp();
  if (/^deploy\s+(check|status|scan|budget)$/i.test(lower)) {
    return mod.formatDeployCheck(await mod.runDeployCheck());
  }
  // unknown deploy* → guardian help (legacy)
  if (/^(deploy|guardian)\b/i.test(lower)) return mod.deployHelp();
  return null;
}

export default { tryHandle, isDeployText };
