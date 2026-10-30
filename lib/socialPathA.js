/**
 * socialPathA.js — Agent-14 Social Path-A (no Make required)
 * Queue post → Telegram SOCIAL_CHANNEL_ID + optional MAKE webhook + FB Graph if token set
 */
'use strict';

async function tgApi(method, body) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  const res = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error((j.description || 'tg fail') + '');
  return j.result;
}

export async function socialPost(text, opts = {}) {
  const msg = String(text || '').trim();
  if (!msg) return 'Usage: social post <caption>';

  const lines = ['📣 SOCIAL PATH-A'];
  const channel = String(process.env.SOCIAL_CHANNEL_ID || '').trim();
  if (channel) {
    try {
      await tgApi('sendMessage', {
        chat_id: channel,
        text: msg.slice(0, 4000),
        disable_web_page_preview: false,
      });
      lines.push('✅ Queue channel: ' + channel);
    } catch (e) {
      lines.push('❌ Channel: ' + (e.message || e));
    }
  } else {
    lines.push('⚠ SOCIAL_CHANNEL_ID not set (Telegram queue skipped)');
  }

  const hook = String(process.env.MAKE_SOCIAL_WEBHOOK || '').trim();
  if (hook) {
    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          source: 'pasiya-bot',
          ts: Date.now(),
          type: opts.type || 'post',
        }),
        signal: AbortSignal.timeout(15000),
      });
      lines.push(r.ok ? '✅ Make webhook notified' : '⚠ Make webhook HTTP ' + r.status);
    } catch (e) {
      lines.push('❌ Make: ' + (e.message || e));
    }
  }

  // Direct Facebook Page (Path-A) if tokens present
  const pageId = process.env.FB_PAGE_ID || '';
  const pageToken = process.env.FB_PAGE_TOKEN || '';
  if (pageId && pageToken) {
    try {
      const url =
        'https://graph.facebook.com/v20.0/' +
        encodeURIComponent(pageId) +
        '/feed';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, access_token: pageToken }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json().catch(() => ({}));
      if (j.id) lines.push('✅ Facebook Page post: ' + j.id);
      else lines.push('❌ Facebook: ' + JSON.stringify(j).slice(0, 200));
    } catch (e) {
      lines.push('❌ Facebook: ' + (e.message || e));
    }
  } else {
    lines.push('ℹ FB_PAGE_ID/TOKEN not set — skip direct FB (channel/Make still work)');
  }

  return lines.join('\n');
}

export async function socialHelp() {
  return [
    '📣 SOCIAL PATH-A',
    '• social post <text>  — queue + webhook + FB if configured',
    '',
    'Env:',
    '  SOCIAL_CHANNEL_ID  Telegram private channel',
    '  MAKE_SOCIAL_WEBHOOK  optional',
    '  FB_PAGE_ID + FB_PAGE_TOKEN  optional direct Page post',
  ].join('\n');
}

export default { socialPost, socialHelp };
