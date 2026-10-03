/**
 * api/cron-watch.js — Pack R1 website change monitor
 * Auth: CRON_SECRET · Schedule: every 1–6 hours
 */
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
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
  if (q === CRON_SECRET) return true;
  const auth = String(req.headers['authorization'] || '');
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === CRON_SECRET) return true;
  return false;
}
async function getSetting(c, key) {
  const { data } = await c.from('rq_bot_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}
async function setSetting(c, key, value) {
  await c.from('rq_bot_settings').upsert({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  });
}
async function tgSend(chatId, text) {
  if (!BOT_TOKEN || !chatId) return;
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
  }).catch(() => {});
}
function fingerprint(html) {
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

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const client = sb();
  if (!client) {
    res.status(500).json({ ok: false, error: 'no supabase' });
    return;
  }
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
      const fp = fingerprint(html);
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
            fp.len +
            '\n/watchlist'
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
  res.status(200).json({ ok: true, checked, changed, remaining: next.length });
}
