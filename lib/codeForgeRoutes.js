import * as forge from './codeForge.js';

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
  if (!/^(forge|codeforge)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();
  if (/^(forge|codeforge)(\s+help)?$/i.test(lower)) return forge.forgeHelp();

  let m = raw.match(/^forge\s+plan\s+([\s\S]+)/i);
  if (m) return forge.forgePlan(m[1].trim());

  m = raw.match(/^forge\s+fix\s+([\s\S]+)/i);
  if (m) return forge.forgeFix(m[1].trim());

  m = raw.match(/^forge\s+file\s+([^|]+)\|\s*([\s\S]+)/i);
  if (m) return forge.forgeFile(m[1].trim(), m[2].trim());

  return forge.forgeHelp();
}

export default { tryHandle };
