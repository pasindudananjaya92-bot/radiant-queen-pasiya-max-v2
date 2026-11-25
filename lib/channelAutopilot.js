/**
 * Channel Autopilot · Wave 37-S4
 * Draft-only Telegram channel posts. No auto-send.
 */
const VERSION = '37-S4';

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

export async function draftChannelPost(text) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'empty' };

  // Prefer receptionist / channel helpers if present
  const rec = await safeImport('./receptionistManager.js');
  if (rec && typeof rec.channelDraft === 'function') {
    const r = await safeCall(() => rec.channelDraft(body), null);
    if (r && !r.__err) {
      return { ok: true, via: 'receptionist', preview: body.slice(0, 500), raw: r };
    }
  }

  // Store as twin-style draft note if twin exists
  const twin = await safeImport('./twinEngine.js');
  if (twin && typeof twin.createDraft === 'function') {
    const r = await safeCall(
      () => twin.createDraft({ message: body, source: 'channel_autopilot' }),
      null
    );
    if (r && !r.__err) {
      return { ok: true, via: 'twin', id: r.id || r.shortId, preview: body.slice(0, 500) };
    }
  }

  return {
    ok: true,
    via: 'local',
    preview: body.slice(0, 900),
    note: 'Preview only. Set TELEGRAMCHANNELID + use `channel post` when ready. Never auto-sent.',
  };
}

export function formatDraft(r) {
  if (!r || !r.ok) return '❌ Channel draft failed: ' + (r?.error || 'unknown');
  return [
    '📢 *Channel Autopilot · ' + VERSION + '*',
    'Status: DRAFT only (not posted)',
    r.id ? 'Id: ' + String(r.id).slice(0, 8) : '',
    'Via: ' + (r.via || 'local'),
    '',
    '*Preview*',
    r.preview || '',
    '',
    r.note || 'Post manually: `channel post <text>` when TELEGRAMCHANNELID is set.',
    '_GODMODEAUTO=OFF · no auto TG to public_',
  ]
    .filter(Boolean)
    .join('\n');
}

export function helpText() {
  return [
    '📢 *Channel Autopilot · ' + VERSION + '*',
    'Draft channel posts · never auto-send',
    '',
    '• `channel help`',
    '• `channel draft <text>` — save/preview draft',
    '• `channel pack | <text>` — same',
    '',
    'Live post still requires your `channel post` + TELEGRAMCHANNELID.',
    '_Draft-safe._',
  ].join('\n');
}

export default { VERSION, draftChannelPost, formatDraft, helpText };
