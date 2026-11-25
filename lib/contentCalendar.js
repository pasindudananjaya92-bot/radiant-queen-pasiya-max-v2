/**
 * Setup-2 · Content Calendar Engine
 * Creates draft packs for Site tip + Blog + Substack (no auto-publish)
 */
export const VERSION = '37A-S2';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function buildContentPack({ topic } = {}) {
  const day = todayKey();
  const title =
    topic ||
    'Queen OS note · ' + day;
  const body = [
    'Mobile founders can run automation from Telegram.',
    'Stack: Vercel · Supabase · Queen OS.',
    'Draft only — Founder publishes when ready.',
    '',
    'CTA: Telegram @PasiyaMaxQueen_bot · https://pasiya-max-site.gt.tc',
  ].join('\n');

  const out = {
    ok: true,
    day,
    title,
    blogId: null,
    substackId: null,
    ytId: null,
    siteTip: null,
    errors: [],
  };

  // Blog draft
  try {
    const blog = await import('./blogManager.js');
    if (typeof blog.blogDraft === 'function') {
      const b = await blog.blogDraft({ title, body, tags: 'QueenOS,mobile' });
      if (b.ok) out.blogId = b.id || b.item?.id;
      else out.errors.push('blog: ' + (b.error || 'fail'));
    }
  } catch (e) {
    out.errors.push('blog: ' + (e.message || 'missing'));
  }

  // Substack draft
  try {
    const ss = await import('./substackManager.js');
    if (typeof ss.substackDraft === 'function') {
      const s = await ss.substackDraft({ title, body, tags: 'QueenOS' });
      if (s.ok) out.substackId = s.id || s.item?.id;
      else out.errors.push('substack: ' + (s.error || 'fail'));
    }
  } catch (e) {
    out.errors.push('substack: ' + (e.message || 'missing'));
  }

  // YouTube pack draft (optional)
  try {
    const yt = await import('./youtubeManager.js');
    if (typeof yt.ytDraft === 'function') {
      const y = await yt.ytDraft({
        title,
        description: body,
      });
      if (y.ok) out.ytId = y.id;
    } else if (typeof yt.youtubeDraft === 'function') {
      const y = await yt.youtubeDraft({ title, description: body });
      if (y.ok) out.ytId = y.id;
    }
  } catch (_) {}

  // Site tip (content only — no force publish)
  out.siteTip =
    'site sync pricing optional · or site generate home | ' +
    title.slice(0, 80) +
    ' — then site publish when ready';

  return out;
}

export function formatPack(p) {
  const lines = [
    '🗓 *Content Pack · ' + VERSION + '*',
    'Day: ' + p.day,
    'Title: ' + p.title,
    '',
    p.blogId ? '📝 Blog draft `' + String(p.blogId).slice(0, 8) + '` → `blog publish <id>`' : '📝 Blog: —',
    p.substackId
      ? '📰 Substack `' + String(p.substackId).slice(0, 8) + '` → `substack pack <id>`'
      : '📰 Substack: —',
    p.ytId ? '🎬 YouTube `' + String(p.ytId).slice(0, 8) + '` → `yt pack <id>`' : '🎬 YouTube: —',
    '',
    '🌐 Site: ' + (p.siteTip || '—'),
    '',
    '_No auto-publish. Founder publishes each channel._',
  ];
  if (p.errors?.length) {
    lines.push('', 'Notes:', ...p.errors.map((e) => '· ' + e));
  }
  return lines.join('\n');
}

export function contentHelp() {
  return [
    '🗓 *Content Calendar · ' + VERSION + '*',
    '',
    '• `content help`',
    '• `content today` — draft pack (blog + substack + yt)',
    '• `content pack | <topic>` — custom topic',
    '',
    'Publish yourself: blog publish · substack pack · yt pack · site publish',
  ].join('\n');
}
