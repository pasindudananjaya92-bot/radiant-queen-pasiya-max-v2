import * as blog from './blogManager.js';

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
  if (!raw || !/^blog\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  if (/^blog(\s+help)?$/i.test(raw)) return blog.blogHelp();

  if (/^blog\s+list\b/i.test(raw)) {
    const r = await blog.blogListLive(8);
    if (!r.ok) return '❌ Blog list: ' + r.error;
    return blog.formatLiveList(r.rows, r.blog);
  }

  if (/^blog\s+queue\b/i.test(raw)) {
    const r = await blog.blogQueue(15);
    if (!r.ok) return '❌ Blog queue: ' + r.error;
    return blog.formatQueue(r.rows);
  }

  let m = raw.match(/^blog\s+draft\s+([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const title = parts[0] || 'Untitled';
    const body = parts.slice(1).join(' | ').trim();
    if (!body) return 'Usage: `blog draft Title | body paragraph...`';
    const r = await blog.blogDraft({ title, body });
    if (!r.ok) return '❌ Blog draft: ' + r.error;
    return (
      '✅ Draft saved `' +
      String(r.draft.id).slice(0, 8) +
      '`\n*' +
      r.draft.title +
      '*\nPublish: `blog publish ' +
      String(r.draft.id).slice(0, 8) +
      '`'
    );
  }

  m = raw.match(/^blog\s+get\s+([a-f0-9-]{8,})/i);
  if (m) {
    const r = await blog.blogGet(m[1]);
    if (!r.ok) return '❌ Blog: ' + r.error;
    const d = r.draft;
    return [
      '📝 *' + d.title + '*',
      'Status: ' + d.status,
      'id: `' + d.id + '`',
      '',
      String(d.body || '').slice(0, 1500),
      d.error ? '\nError: ' + d.error : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  m = raw.match(/^blog\s+publish\s+now\s*\|\s*([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const title = parts[0] || 'Untitled';
    const body = parts.slice(1).join(' | ').trim();
    if (!body) return 'Usage: `blog publish now | Title | body`';
    const d = await blog.blogDraft({ title, body });
    if (!d.ok) return '❌ Blog: ' + d.error;
    const p = await blog.blogPublish(d.draft.id);
    if (!p.ok) return '❌ Publish: ' + p.error;
    return (
      '✅ Published via Mail2Blogger\n*' +
      p.title +
      '*\nCheck: ' +
      p.blog +
      '\n_Email id: ' +
      (p.emailId || 'ok') +
      '_'
    );
  }

  m = raw.match(/^blog\s+publish\s+([a-f0-9-]{8,})/i);
  if (m) {
    const p = await blog.blogPublish(m[1]);
    if (!p.ok) return '❌ Publish: ' + p.error;
    return (
      '✅ Published via Mail2Blogger\n*' +
      p.title +
      '*\nCheck: ' +
      p.blog +
      '\n_May take ~1–2 min to appear on Blogger._'
    );
  }

  return blog.blogHelp();
}

export default { tryHandle };
