/**
 * Content Calendar · Wave 37-S4 (ESM fix)
 * Delegates pack creation to Publish Bus when possible.
 */
const VERSION = '37-S4';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

export async function contentToday(topic) {
  const bus = await safeImport('./publishBus.js');
  if (bus && typeof bus.buildPublishPack === 'function') {
    const bundle = await bus.buildPublishPack(topic || '');
    const text = bus.formatPack(bundle);
    return { ok: true, text, via: 'publishBus' };
  }
  const t = topic || 'Queen OS note · ' + new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    text: [
      '🗓 *Content Pack · ' + VERSION + '*',
      'Day: ' + new Date().toISOString().slice(0, 10),
      'Title: ' + t,
      '',
      '📝 Blog: — (run `publish pack | ' + t + '`)',
      '📰 Substack: —',
      '🎬 YouTube: —',
      '',
      '🌐 Site: site generate home | ' + t,
      '',
      '_No auto-publish. Founder publishes each channel._',
    ].join('\n'),
    via: 'fallback',
  };
}

export function helpText() {
  return [
    '🗓 *Content Calendar · ' + VERSION + '*',
    '',
    '• `content help`',
    '• `content today` — draft pack (blog + substack + yt)',
    '• `content pack | <topic>` — custom topic',
    '',
    'Also: `publish pack | <topic>` (Publish Bus)',
    'Publish yourself: blog publish · substack pack · yt pack · site publish',
  ].join('\n');
}

export default { VERSION, contentToday, helpText };
