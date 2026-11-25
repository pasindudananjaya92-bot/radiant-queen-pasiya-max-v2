import * as cal from './contentCalendar.js';

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
  if (!raw || !/^content\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  if (/^content(\s+help)?$/i.test(raw)) return cal.contentHelp();

  if (/^content\s+today\b/i.test(raw)) {
    const p = await cal.buildContentPack({});
    return cal.formatPack(p);
  }

  const m = raw.match(/^content\s+pack\s*\|\s*([\s\S]+)/i);
  if (m) {
    const p = await cal.buildContentPack({ topic: m[1].trim() });
    return cal.formatPack(p);
  }

  const m2 = raw.match(/^content\s+pack\s+([\s\S]+)/i);
  if (m2) {
    const p = await cal.buildContentPack({ topic: m2[1].trim() });
    return cal.formatPack(p);
  }

  return cal.contentHelp();
}
