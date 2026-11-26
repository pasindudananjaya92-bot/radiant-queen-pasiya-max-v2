/**
 * Publish Bus · Wave 37-S4.1
 * Uses real exports: blogDraft · substackDraft · ytDraft
 */
const VERSION = '37-S4.1';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fallback) {
  try {
    if (typeof fn !== 'function') return fallback;
    return await fn();
  } catch (e) {
    return { __err: e.message || String(e) };
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function pickId(r) {
  if (!r || r.__err) return null;
  return r.id || r.short_id || r.shortId || r.uuid || r.draft_id || null;
}

export async function buildPublishPack(topic) {
  const started = Date.now();
  const t = String(topic || '').trim() || ('Queen OS note · ' + todayStamp());
  const body =
    t +
    '\n\nMobile-first automation · Telegram + Vercel + Supabase.\nFounder-approved money/code only.';

  const result = {
    topic: t,
    blogId: null,
    substackId: null,
    ytId: null,
    siteNote: null,
    errors: [],
  };

  const blog = await safeImport('./blogManager.js');
  if (blog) {
    const fn = blog.blogDraft || blog.createDraft || blog.saveDraft || blog.draft;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn({ title: t, body, tags: 'QueenOS,mobile' }), null);
      if (r && r.__err) result.errors.push('blog: ' + r.__err);
      else {
        result.blogId = pickId(r);
        if (!result.blogId) result.errors.push('blog: draft ran but no id in response');
      }
    } else result.errors.push('blog: no blogDraft export');
  } else result.errors.push('blog: module n/a');

  const ss = await safeImport('./substackManager.js');
  if (ss) {
    const fn = ss.substackDraft || ss.createDraft || ss.saveDraft || ss.draft;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn({ title: t, body, tags: 'QueenOS' }), null);
      if (r && r.__err) result.errors.push('substack: ' + r.__err);
      else {
        result.substackId = pickId(r);
        if (!result.substackId) result.errors.push('substack: draft ran but no id');
      }
    } else result.errors.push('substack: no substackDraft export');
  } else result.errors.push('substack: module n/a');

  let yt = await safeImport('./youtubeManager.js');
  if (!yt) yt = await safeImport('./ytManager.js');
  if (yt) {
    const fn = yt.ytDraft || yt.createDraft || yt.saveDraft || yt.draft;
    if (typeof fn === 'function') {
      const r = await safeCall(
        () => fn({ title: t, description: body, tags: 'Queen OS, Telegram bot, mobile' }),
        null
      );
      if (r && r.__err) result.errors.push('yt: ' + r.__err);
      else {
        result.ytId = pickId(r);
        if (!result.ytId) result.errors.push('yt: draft ran but no id');
      }
    } else result.errors.push('yt: no ytDraft export');
  } else result.errors.push('yt: module n/a');

  result.siteNote =
    'site generate home | ' + t + ' — then site publish when ready (never auto)';

  return { result, ms: Date.now() - started };
}

export function formatPack(bundle) {
  const { result, ms } = bundle;
  const short = (id) => (id ? String(id).slice(0, 8) : '—');
  const lines = [
    '🚌 *Publish Bus · ' + VERSION + '*',
    'Topic: ' + result.topic,
    '',
    '📝 Blog: ' + short(result.blogId) + (result.blogId ? ' → `blog publish ' + short(result.blogId) + '`' : ''),
    '📰 Substack: ' + short(result.substackId) + (result.substackId ? ' → `substack pack ' + short(result.substackId) + '`' : ''),
    '🎬 YouTube: ' + short(result.ytId) + (result.ytId ? ' → `yt pack ' + short(result.ytId) + '`' : ''),
    '🌐 Site: ' + result.siteNote,
    '',
    '*Approve list (you publish)*',
    '1. Review each draft/pack',
    '2. Publish only channels you want',
    '3. Never auto-posts',
  ];
  if (result.errors.length) {
    lines.push('', '*Notes*', ...result.errors.map((e) => '· ' + e));
  }
  lines.push('', '_' + ms + 'ms · draft-safe_');
  return lines.join('\n');
}

export function helpText() {
  return [
    '🚌 *Publish Bus · ' + VERSION + '*',
    'One pack → blog + substack + yt + site tip',
    '',
    '• `publish help`',
    '• `publish pack` — today default topic',
    '• `publish pack | <topic>` — custom topic',
    '• `pub pack | <topic>` — alias',
    '',
    '_No auto-publish. Founder runs blog/substack/yt/site publish._',
  ].join('\n');
}

export default { VERSION, buildPublishPack, formatPack, helpText };
