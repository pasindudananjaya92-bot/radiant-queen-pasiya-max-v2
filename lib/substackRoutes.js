/**
 * Wave 34A — Substack routes (tryHandle — same pattern as blogRoutes)
 */
import * as S from './substackManager.js';

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
  if (!raw || !/^substack\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  if (/^substack(\s+help)?$/i.test(raw)) return S.substackHelp();

  if (/^substack\s+list\b/i.test(raw) || /^substack\s+live\b/i.test(raw)) {
    const r = await S.substackListLive(8);
    if (!r.ok) return '❌ Substack list: ' + r.error;
    return S.formatLiveList(r.rows, r.blog);
  }

  if (/^substack\s+queue\b/i.test(raw) || /^substack\s+drafts\b/i.test(raw)) {
    const r = await S.substackQueue(15);
    if (!r.ok) return '❌ Substack queue: ' + r.error;
    return S.formatQueue(r.rows);
  }

  let m = raw.match(/^substack\s+draft\s+([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const title = parts[0] || 'Untitled';
    const body = parts.slice(1).join(' | ').trim();
    if (!body) return 'Usage: `substack draft Title | body paragraph...`';
    const r = await S.substackDraft({ title, body });
    if (!r.ok) return '❌ Substack draft: ' + r.error;
    return (
      '✅ Draft saved `' +
      String(r.draft.id).slice(0, 8) +
      '`\n*' +
      r.draft.title +
      '*\nPack: `substack pack ' +
      String(r.draft.id).slice(0, 8) +
      '`'
    );
  }

  m = raw.match(/^substack\s+get\s+([a-f0-9-]{8,})/i);
  if (m) {
    const r = await S.substackGet(m[1]);
    if (!r.ok) return '❌ Substack: ' + r.error;
    const d = r.draft;
    return [
      '📰 *' + d.title + '*',
      'Status: ' + d.status,
      'id: `' + d.id + '`',
      '',
      String(d.body || '').slice(0, 1500),
      d.error ? '\nError: ' + d.error : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  m = raw.match(/^substack\s+pack\s+([a-f0-9-]{8,})/i);
  if (m) {
    const p = await S.substackPack(m[1]);
    if (!p.ok) return '❌ Substack pack: ' + p.error;
    return [
      '📦 *Substack pack* `' + String(p.id).slice(0, 8) + '`',
      '*' + p.title + '*',
      '',
      'Copy below → Substack app → New post:',
      '',
      String(p.markdown || '').slice(0, 3500),
    ].join('\n');
  }

  return S.substackHelp();
}

export default { tryHandle };
