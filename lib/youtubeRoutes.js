/**
 * Wave 35A — YouTube Desk routes (tryHandle)
 * Prefixes: yt | youtube
 */
import * as Y from './youtubeManager.js';

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
  if (!raw || !/^(yt|youtube)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  // normalize youtube → yt for matching
  const norm = raw.replace(/^(youtube)\b/i, 'yt');

  if (/^yt(\s+help)?$/i.test(norm)) return Y.youtubeHelp();

  if (/^yt\s+queue\b/i.test(norm) || /^yt\s+drafts\b/i.test(norm)) {
    const r = await Y.ytQueue(15);
    if (!r.ok) return '❌ YT queue: ' + r.error;
    return Y.formatQueue(r.rows);
  }

  let m = norm.match(/^yt\s+draft\s+([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const title = (parts[0] || 'Untitled').slice(0, 100);
    const description = parts.slice(1).join(' | ').trim();
    if (!description) return 'Usage: `yt draft Title | description text...`';
    const r = await Y.ytDraft({ title, description });
    if (!r.ok) return '❌ YT draft: ' + r.error;
    return (
      '✅ YT draft `' +
      String(r.draft.id).slice(0, 8) +
      '`\n*' +
      r.draft.title +
      '*\nPack: `yt pack ' +
      String(r.draft.id).slice(0, 8) +
      '`'
    );
  }

  m = norm.match(/^yt\s+get\s+([a-f0-9-]{8,})/i);
  if (m) {
    const r = await Y.ytGet(m[1]);
    if (!r.ok) return '❌ YT: ' + r.error;
    const d = r.draft;
    return [
      '🎬 *' + d.title + '*',
      'Status: ' + d.status,
      'id: `' + d.id + '`',
      '',
      String(d.description || '').slice(0, 1500),
    ].join('\n');
  }

  m = norm.match(/^yt\s+pack\s+([a-f0-9-]{8,})/i);
  if (m) {
    const p = await Y.ytPack(m[1]);
    if (!p.ok) return '❌ YT pack: ' + p.error;
    return [
      '📦 *YouTube pack* `' + String(p.id).slice(0, 8) + '`',
      '',
      'Copy into YouTube app (title + description + tags):',
      '',
      String(p.pack || '').slice(0, 3500),
    ].join('\n');
  }

  return Y.youtubeHelp();
}

export default { tryHandle };
