/**
 * socialPathA.js — Agent-14/16 Social Path-A
 * Channel queue + Make webhook + Facebook Page Graph
 * socialdigest: latest swarm digest → socialPost
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

function fbConfigured() {
  return Boolean(
    String(process.env.FB_PAGE_ID || '').trim() &&
      String(process.env.FB_PAGE_TOKEN || '').trim()
  );
}

export async function socialFbCheck() {
  const pageId = String(process.env.FB_PAGE_ID || '').trim();
  const pageToken = String(process.env.FB_PAGE_TOKEN || '').trim();
  const lines = ['📘 FACEBOOK PATH-A CHECK', ''];
  lines.push('FB_PAGE_ID: ' + (pageId ? pageId.slice(0, 8) + '…' : 'MISSING'));
  lines.push('FB_PAGE_TOKEN: ' + (pageToken ? 'set (' + pageToken.length + ' chars)' : 'MISSING'));
  if (!pageId || !pageToken) {
    lines.push('');
    lines.push('Set both in Vercel → Redeploy Hull A.');
    lines.push('Token must be PAGE access token (from GET /me/accounts).');
    return lines.join('\n');
  }
  try {
    const url =
      'https://graph.facebook.com/v20.0/' +
      encodeURIComponent(pageId) +
      '?fields=id,name&access_token=' +
      encodeURIComponent(pageToken);
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (j.id) {
      lines.push('✅ Graph OK · page: ' + (j.name || j.id));
    } else {
      lines.push('❌ Graph: ' + JSON.stringify(j).slice(0, 300));
      lines.push('Hint: use Page token, not User token; pages_manage_posts required.');
    }
  } catch (e) {
    lines.push('❌ ' + (e.message || e));
  }
  return lines.join('\n');
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

  const pageId = String(process.env.FB_PAGE_ID || '').trim();
  const pageToken = String(process.env.FB_PAGE_TOKEN || '').trim();
  if (pageId && pageToken) {
    try {
      const url =
        'https://graph.facebook.com/v20.0/' +
        encodeURIComponent(pageId) +
        '/feed';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg.slice(0, 6000), access_token: pageToken }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json().catch(() => ({}));
      if (j.id) lines.push('✅ Facebook Page post: ' + j.id);
      else lines.push('❌ Facebook: ' + JSON.stringify(j).slice(0, 280));
    } catch (e) {
      lines.push('❌ Facebook: ' + (e.message || e));
    }
  } else {
    lines.push('ℹ FB_PAGE_ID/TOKEN not set — skip direct FB (channel/Make still work)');
  }

  return lines.join('\n');
}

async function fetchLatestDigestText() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) return null;
  try {
    const r = await fetch(
      url +
        '/rest/v1/rq_swarm_digests?select=id,created_at,content,summary,body&order=created_at.desc&limit=1',
      {
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = rows[0];
    const text =
      row.content || row.summary || row.body || JSON.stringify(row).slice(0, 3500);
    return String(text).slice(0, 3500);
  } catch (_) {
    return null;
  }
}

/** Publish latest swarm digest (or fallback line) to social channels */
export async function socialDigest(opts = {}) {
  let text = await fetchLatestDigestText();
  if (!text) {
    text =
      opts.fallback ||
      'PasiyaOS Swarm Digest — no rows in rq_swarm_digests yet. Run: swarm digest';
  }
  const header =
    '🧠 PasiyaOS Daily Digest\n' + new Date().toISOString().slice(0, 16) + ' UTC\n\n';
  return await socialPost(header + text, { type: 'digest' });
}

/** Cron entry */
export async function jobSocialDigest() {
  const out = await socialDigest();
  return { ok: true, job: 'socialdigest', preview: String(out).slice(0, 500) };
}

export async function socialHelp() {
  return [
    '📣 SOCIAL PATH-A (Agent-16)',
    '• social post <text>',
    '• social fbcheck — verify FB_PAGE_ID + PAGE token',
    '• social digest — publish latest swarm digest',
    '',
    'Env:',
    '  SOCIAL_CHANNEL_ID',
    '  MAKE_SOCIAL_WEBHOOK (optional)',
    '  FB_PAGE_ID + FB_PAGE_TOKEN (Page token from /me/accounts)',
    '',
    'Cron: /api/cron?job=socialdigest&secret=CRON_SECRET',
  ].join('\n');
}

export default {
  socialPost,
  socialHelp,
  socialFbCheck,
  socialDigest,
  jobSocialDigest,
  fbConfigured,
};
