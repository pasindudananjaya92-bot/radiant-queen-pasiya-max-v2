import * as arch from './architectEngine.js';

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
  if (!raw || !/^(architect|arch)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
  const lower = raw.toLowerCase();
  if (/^(architect|arch)(\s+help)?$/i.test(lower)) return arch.architectHelp();
  if (/^(architect|arch)\s+audit$/i.test(lower)) return arch.architectAudit();
  if (/^(architect|arch)\s+plan$/i.test(lower)) return arch.architectPlan();
  const m = raw.match(/^(?:architect|arch)\s+gap\s+([\s\S]+)/i);
  if (m) return arch.architectGap(m[1].trim());
  return arch.architectHelp();
}
export default { tryHandle };
