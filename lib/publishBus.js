/**
 * Publish Bus · Wave 37-S4.2
 * Real exports + correct id path: result.draft.id
 */
const VERSION = '37-S4.2';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn) {
  try {
    if (typeof fn !== 'function') return { __err: 'not_a_function' };
    return await fn();
  } catch (e) {
    return { __err: e.message || String(e) };
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** blogDraft/substackDraft/ytDraft return { ok, draft: { id } } or { ok:false, error } */
function pickId(r) {
  if (!r || r.__err) return null;
  if (r.ok === false) return null;
  if (r.draft && r.draft.id) return r.draft.id;
  if (r.id) return r.id;
  if (r.data && r.data.id) return r.data.id;
  if (r.row && r.row.id) return r.row.id;
  return null;
}

function errOf(r) {
  if (!r) return 'null response';
  if (r.__err) return r.__err;
  if (r.ok === false) return r.error || 'ok:false';
  return null;
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
  if (blog && typeof blog.blogDraft === 'function') {
    const r = await safeCall(() => blog.blogDraft({ title: t, body, tags: 'QueenOS,mobile' }));
    const e = errOf(r);
    if (e) result.errors.push('blog: ' + e);
    else {
      result.blogId = pickId(r);
      if (!result.blogId) result.errors.push('blog: no id (unexpected shape)');
    }
  } else result.errors.push('blog: blogDraft n/a');

  const ss = await safeImport('./substackManager.js');
  if (ss && typeof ss.substackDraft === 'function') {
    const r = await safeCall(() => ss.substackDraft({ title: t, body, tags: 'QueenOS' }));
    const e = errOf(r);
    if (e) result.errors.push('substack: ' + e);
    else {
      result.substackId = pickId(r);
      if (!result.substackId) result.errors.push('substack: no id (unexpected shape)');
    }
  } else result.errors.push('substack: substackDraft n/a');

  const yt = await safeImport('./youtubeManager.js');
  if (yt && typeof yt.ytDraft === 'function') {
    const r = await safeCall(() =>
      yt.ytDraft({ title: t, description: body, tags: 'Queen OS, Telegram bot, mobile' })
    );
    const e = errOf(r);
    if (e) result.errors.push('yt: ' + e);
    else {
      result.ytId = pickId(r);
      if (!result.ytId) result.errors.push('yt: no id (unexpected shape)');
    }
  } else result.errors.push('yt: ytDraft n/a');

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
