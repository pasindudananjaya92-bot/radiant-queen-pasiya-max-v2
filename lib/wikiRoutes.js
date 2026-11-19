import * as wiki from './wikiManager.js';

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
  if (!raw || !/^wiki\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
  if (/^wiki(\s+help)?$/i.test(raw)) return wiki.wikiHelp();
  const m = raw.match(/^wiki\s+([\s\S]+)/i);
  if (m) return wiki.wikiSummary(m[1].trim());
  return wiki.wikiHelp();
}
export default { tryHandle };
