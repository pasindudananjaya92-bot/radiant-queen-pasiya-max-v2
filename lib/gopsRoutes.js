/**
 * Wave 36A — GitHub Ops routes (tryHandle)
 * Prefix: gops
 */
import * as G from './gopsManager.js';

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
  if (!raw || !/^gops\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  if (/^gops(\s+help)?$/i.test(raw)) return G.gopsHelp();

  if (/^gops\s+repo\b/i.test(raw) || /^gops\s+status\b/i.test(raw)) {
    const r = await G.gopsRepo();
    return r.ok ? r.text : '❌ GOps repo: ' + r.error;
  }

  if (/^gops\s+issues\b/i.test(raw) || /^gops\s+issue\s+list\b/i.test(raw)) {
    const r = await G.gopsIssues(10);
    return r.ok ? r.text : '❌ GOps issues: ' + r.error;
  }

  if (/^gops\s+actions\b/i.test(raw) || /^gops\s+runs\b/i.test(raw)) {
    const r = await G.gopsActions(8);
    return r.ok ? r.text : '❌ GOps actions: ' + r.error;
  }

  let m = raw.match(/^gops\s+issue\s+#?(\d+)\b/i);
  if (m) {
    const r = await G.gopsIssue(m[1]);
    return r.ok ? r.text : '❌ GOps issue: ' + r.error;
  }

  m = raw.match(/^gops\s+open\s+([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const title = parts[0] || '';
    const body = parts.slice(1).join(' | ').trim();
    if (!title) return 'Usage: `gops open Title | body details`';
    const r = await G.gopsOpenIssue(title, body);
    return r.ok ? r.text : '❌ GOps open: ' + r.error;
  }

  return G.gopsHelp();
}

export default { tryHandle };
