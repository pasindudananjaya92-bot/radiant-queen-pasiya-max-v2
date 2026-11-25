import * as desk from './pipelineDesk.js';

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

  // desk family
  if (/^desk\b/i.test(raw)) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    if (/^desk(\s+help)?$/i.test(raw)) return desk.deskHelp();
    const m = raw.match(/^desk\s+reply\s+([a-f0-9-]{8,})/i);
    if (m) {
      const r = await desk.deskReply(m[1], ctx);
      return r.ok ? r.text : '❌ Desk: ' + r.error;
    }
    return desk.deskHelp();
  }

  // inbox reply alias (also handled if receptionist misses)
  if (/^inbox\s+reply\s+([a-f0-9-]{8,})/i.test(raw)) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    const m = raw.match(/^inbox\s+reply\s+([a-f0-9-]{8,})/i);
    const r = await desk.deskReply(m[1], ctx);
    return r.ok ? r.text : '❌ Desk: ' + r.error;
  }

  return null;
}
