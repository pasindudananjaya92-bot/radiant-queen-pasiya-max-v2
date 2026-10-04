/**
 * lib/devAuth.js — Founder-only gate for Pack R-Dev
 */
export function isFounder(ctx, adminId) {
  const id = String(ctx?.from?.id || '');
  const admin = String(adminId || process.env.ADMIN_ID || '').trim();
  return !!admin && id === admin;
}

export async function requireFounder(ctx, adminId) {
  if (!isFounder(ctx, adminId)) {
    await ctx.reply('👑 Founder-only · Dev console locked.');
    return false;
  }
  return true;
}

export function maskSecret(v) {
  const s = String(v || '');
  if (s.length <= 6) return '***';
  return s.slice(0, 3) + '…' + s.slice(-3);
}

export default { isFounder, requireFounder, maskSecret };
