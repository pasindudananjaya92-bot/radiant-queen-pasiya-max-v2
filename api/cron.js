/**
 * api/cron.js — CONSOLIDATED cron router (Vercel Hobby ≤12 functions)
 *
 * Usage:
 *   /api/cron?job=ghost&secret=...
 *   /api/cron?job=track&secret=...
 *   /api/cron?job=watch&secret=...
 *   /api/cron?job=reminders&secret=...
 *   /api/cron?job=digest&secret=...
 *   /api/cron?job=all&secret=...   (ghost+track+watch only — light)
 *
 * Legacy paths (via vercel.json rewrite → this file):
 *   /api/cron-ghost → job=ghost
 *   /api/cron-track → job=track
 *   /api/cron-watch → job=watch
 *   /api/cron-reminders → job=reminders
 *   /api/cron-digest → job=digest
 */
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const CRON_SECRET = process.env.CRON_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorized(req) {
  if (!CRON_SECRET) return true;
  const q = String(req.query?.secret || '').trim();
  if (q && q === CRON_SECRET) return true;
  const h = String(req.headers['x-cron-secret'] || '').trim();
  if (h && h === CRON_SECRET) return true;
  const auth = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  if (auth === 'Bearer ' + CRON_SECRET) return true;
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === CRON_SECRET) return true;
  return false;
}

function detectJob(req) {
  const q = String(req.query?.job || req.query?.task || '').toLowerCase().trim();
  if (q) return q;
  const url = String(req.url || '');
  if (url.includes('cron-ghost')) return 'ghost';
  if (url.includes('cron-track')) return 'track';
  if (url.includes('cron-watch')) return 'watch';
  if (url.includes('cron-reminders') || url.includes('cron-reminder')) return 'reminders';
  if (url.includes('cron-digest')) return 'digest';
  return 'help';
}

async function getSetting(client, key) {
  const { data } = await client.from('rq_bot_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

async function setSetting(client, key, value) {
  if (value == null) {
    await client.from('rq_bot_settings').delete().eq('key', key);
    return;
  }
  await client.from('rq_bot_settings').upsert({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  });
}

async function tgSend(chatId, text) {
  if (!BOT_TOKEN || !chatId) return { ok: false };
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok };
  } catch (_) {
    return { ok: false };
  }
}

async function tgDelete(chatId, messageId) {
  if (!BOT_TOKEN) return { ok: false };
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/deleteMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, description: j.description };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function unseal(sealed, key) {
  try {
    const raw = Buffer.from(String(sealed || ''), 'base64').toString('binary');
    const k = String(key || 'rq');
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      out.push(String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
    }
    return out.join('');
  } catch (_) {
    return '';
  }
}

// ——— JOBS ———

async function jobGhost(client) {
  const now = Date.now();
  let deleted = 0;
  let capsulesOpened = 0;
  const errors = [];

  try {
    const raw = await getSetting(client, 'ghost_queue');
    let list = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch (_) {
        list = [];
      }
    }
    const due = [];
    const keep = [];
    for (const g of Array.isArray(list) ? list : []) {
      if (!g?.deleteAt) continue;
      if (new Date(g.deleteAt).getTime() <= now) due.push(g);
      else keep.push(g);
    }
    for (const g of due) {
      const r = await tgDelete(g.chatId, g.messageId);
      if (r.ok) deleted += 1;
      else errors.push('del ' + g.messageId + ': ' + (r.description || r.error || 'fail'));
    }
    await setSetting(client, 'ghost_queue', JSON.stringify(keep.slice(-80)));
  } catch (e) {
    errors.push('ghost: ' + String(e.message || e));
  }

  try {
    const idxRaw = await getSetting(client, 'capsule_index');
    let index = [];
    if (idxRaw) {
      try {
        index = JSON.parse(idxRaw);
      } catch (_) {
        index = [];
      }
    }
    const still = [];
    for (const entry of Array.isArray(index) ? index : []) {
      const uid = String(entry.userId || '');
      if (!uid) continue;
      const key = 'capsules_' + uid;
      const raw = await getSetting(client, key);
      if (!raw) continue;
      let list = [];
      try {
        list = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      let changed = false;
      for (const c of list) {
        if (c.opened) continue;
        if (new Date(c.unlockAt).getTime() > now) continue;
        const text = unseal(c.sealed, uid);
        await tgSend(uid, '📬 TIME CAPSULE OPENED\n\n' + (text || '(empty)'));
        c.opened = true;
        c.openedAt = new Date().toISOString();
        capsulesOpened += 1;
        changed = true;
      }
      if (changed) await setSetting(client, key, JSON.stringify(list.slice(0, 30)));
      if (list.some((c) => !c.opened)) still.push(entry);
    }
    await setSetting(client, 'capsule_index', JSON.stringify(still.slice(-100)));
  } catch (e) {
    errors.push('capsule: ' + String(e.message || e));
  }

  return { job: 'ghost', deleted, capsulesOpened, errors: errors.slice(0, 5) };
}

function extractPrice(html) {
  const t = String(html || '');
  const ld = t.match(/"price"\s*:\s*"?([\d.]+)"?/i);
  if (ld) {
    const n = parseFloat(ld[1]);
    if (n > 0) return n;
  }
  const money = [...t.matchAll(/(?:Rs\.?|LKR|USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/gi)]
    .map((x) => parseFloat(x[1].replace(/,/g, '')))
    .filter((n) => n > 10 && n < 1e8)
    .sort((a, b) => a - b);
  if (money.length) return money[Math.floor(money.length * 0.25)] || money[0];
  return null;
}

async function jobTrack(client) {
  const raw = await getSetting(client, 'track_list');
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch (_) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  let checked = 0;
  let alerts = 0;
  const next = [];

  for (const item of list.slice(0, 20)) {
    if (!item?.url || !item?.userId) {
      next.push(item);
      continue;
    }
    checked += 1;
    try {
      const r = await fetch(item.url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!r.ok) {
        next.push(item);
        continue;
      }
      const html = await r.text();
      const price = extractPrice(html.slice(0, 350000));
      item.lastPrice = price;
      item.lastCheck = new Date().toISOString();
      if (price != null && item.target != null && price <= Number(item.target)) {
        await tgSend(
          item.userId,
          '📉 PRICE ALERT\n' +
            (item.title ? item.title + '\n' : '') +
            'Now: ' +
            price +
            ' (target ≤ ' +
            item.target +
            ')\n' +
            item.url
        );
        alerts += 1;
        item.alertedAt = new Date().toISOString();
        if (item.once) continue;
      }
      next.push(item);
    } catch (_) {
      next.push(item);
    }
  }

  await setSetting(client, 'track_list', JSON.stringify(next.slice(0, 40)));
  return { job: 'track', checked, alerts, remaining: next.length };
}

function pageFingerprint(html) {
  const t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h) ^ t.charCodeAt(i);
  return { hash: (h >>> 0).toString(16), sample: t.slice(0, 200), len: t.length };
}

async function jobWatch(client) {
  const raw = await getSetting(client, 'watch_list');
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch (_) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  let checked = 0;
  let changed = 0;
  const next = [];

  for (const item of list.slice(0, 15)) {
    if (!item?.url || !item?.userId) {
      next.push(item);
      continue;
    }
    checked += 1;
    try {
      const r = await fetch(item.url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!r.ok) {
        next.push(item);
        continue;
      }
      const html = await r.text();
      const fp = pageFingerprint(html);
      if (item.hash && item.hash !== fp.hash) {
        changed += 1;
        await tgSend(
          item.userId,
          '👀 PAGE CHANGED\n' +
            (item.title || '') +
            '\n' +
            item.url +
            '\nlen ' +
            (item.len || '?') +
            ' → ' +
            fp.len
        );
      }
      item.hash = fp.hash;
      item.len = fp.len;
      item.sample = fp.sample;
      item.lastCheck = new Date().toISOString();
      next.push(item);
    } catch (_) {
      next.push(item);
    }
  }

  await setSetting(client, 'watch_list', JSON.stringify(next.slice(0, 30)));
  return { job: 'watch', checked, changed, remaining: next.length };
}

async function jobReminders(client) {
  try {
    const { fetchDueReminders, markReminderDone } = await import('../lib/reminders.js');
    const due = await fetchDueReminders(client, new Date().toISOString());
    let sent = 0;
    for (const r of due || []) {
      await tgSend(r.user_id || r.userId, '⏰ REMINDER\n' + (r.text || r.message || ''));
      try {
        await markReminderDone(client, r.id);
      } catch (_) {}
      sent += 1;
    }
    return { job: 'reminders', sent, due: (due || []).length };
  } catch (e) {
    return { job: 'reminders', error: String(e.message || e), note: 'lib/reminders.js may be missing' };
  }
}

async function jobDigest(client) {
  try {
    const {
      collectDigestStats,
      buildDigestHtml,
      listDigestEmails,
      sendResendEmail,
      resendConfigured,
    } = await import('../lib/resendMail.js');

    const stats = await collectDigestStats(client);
    const lines = [
      '📬 DAILY DIGEST · Radiant Queen',
      'Time: ' + new Date().toISOString(),
      '',
      'Wallets: ' + (stats.wallets ?? '?') + ' · Premium: ' + (stats.premium ?? '?'),
      'Gold total: ' + (stats.goldSum ?? '?'),
      'Active reminders: ' + (stats.activeRem ?? '?'),
      '',
      'Open: /pulse · /digest',
    ];
    if (ADMIN_ID) await tgSend(ADMIN_ID, lines.join('\n'));

    let emails = 0;
    if (resendConfigured && resendConfigured()) {
      const list = (await listDigestEmails(client)) || [];
      const html = buildDigestHtml ? buildDigestHtml(stats) : '<pre>' + lines.join('\n') + '</pre>';
      for (const em of list.slice(0, 30)) {
        try {
          await sendResendEmail(em, 'Radiant Queen Digest', html);
          emails += 1;
        } catch (_) {}
      }
    }
    return { job: 'digest', tg: true, emails };
  } catch (e) {
    // fallback: founder-only short digest without resendMail
    if (ADMIN_ID) {
      await tgSend(ADMIN_ID, '📬 DIGEST tick @ ' + new Date().toISOString() + '\n(resendMail optional)');
    }
    return { job: 'digest', error: String(e.message || e), fallback: true };
  }
}


async function jobNewsPodcast(client) {
  // Deliver text morning digest to subscribers; voice generated on-demand via /news_podcast
  const raw = await getSetting(client, 'news_podcast_subs');
  let subs = [];
  try {
    subs = raw ? JSON.parse(raw) : [];
  } catch (_) {
    subs = [];
  }
  if (!Array.isArray(subs)) subs = [];
  let sent = 0;
  for (const s of subs.slice(0, 20)) {
    if (!s?.userId || s.enabled === false) continue;
    const feeds = s.feeds || s.feed_urls || [];
    const lines = ['🎙️ NEWS PODCAST READY', 'Time: ' + new Date().toISOString(), ''];
    for (const url of (feeds || []).slice(0, 3)) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(12000),
        });
        const xml = await r.text();
        const titles = [...xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi)]
          .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
          .filter((t) => t && t.length > 5 && t.length < 180)
          .slice(1, 5);
        lines.push('• ' + (url.slice(0, 40)));
        titles.forEach((t) => lines.push('  - ' + t));
      } catch (_) {
        lines.push('• feed error: ' + String(url).slice(0, 40));
      }
    }
    lines.push('', 'Open Telegram → /news_podcast play for audio');
    await tgSend(s.userId, lines.join('\n'));
    sent += 1;
  }
  return { job: 'news_podcast', sent, subs: subs.length };
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const job = detectJob(req);
  const client = sb();

  if (job === 'help') {
    res.status(200).json({
      ok: true,
      jobs: ['ghost', 'track', 'watch', 'reminders', 'digest', 'news_podcast', 'all'],
      example: '/api/cron?job=ghost&secret=CRON_SECRET',
    });
    return;
  }

  if (!client && job !== 'help') {
    res.status(500).json({ ok: false, error: 'no supabase' });
    return;
  }

  try {
    if (job === 'ghost') {
      res.status(200).json({ ok: true, ...(await jobGhost(client)) });
      return;
    }
    if (job === 'track') {
      res.status(200).json({ ok: true, ...(await jobTrack(client)) });
      return;
    }
    if (job === 'watch') {
      res.status(200).json({ ok: true, ...(await jobWatch(client)) });
      return;
    }
    if (job === 'reminders' || job === 'reminder') {
      res.status(200).json({ ok: true, ...(await jobReminders(client)) });
      return;
    }
    if (job === 'digest') {
      res.status(200).json({ ok: true, ...(await jobDigest(client)) });
      return;
    }
    if (job === 'all') {
      const ghost = await jobGhost(client);
      const track = await jobTrack(client);
      const watch = await jobWatch(client);
      res.status(200).json({ ok: true, job: 'all', ghost, track, watch });
      return;
    }

    if (job === 'news_podcast' || job === 'newspodcast') {
      res.status(200).json({ ok: true, ...(await jobNewsPodcast(client)) });
      return;
    }
    res.status(400).json({ ok: false, error: 'unknown job: ' + job });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
