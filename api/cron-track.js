/**
 * api/cron-track.js — Pack Q autopilot price checks
 * Reads track_list from rq_bot_settings, fetches pages, DMs on target hit.
 * Auth: CRON_SECRET
 * Schedule: daily or every few hours (Firecrawl not required — plain fetch)
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
  if (q && q === CRON_SECRET) return true;
  const h = String(req.headers['x-cron-secret'] || '').trim();
  if (h && h === CRON_SECRET) return true;
  const auth = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === CRON_SECRET) return true;
  return false;
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
  if (!BOT_TOKEN || !chatId) return;
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
  }).catch(() => {});
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

  const raw = await getSetting(client, 'track_list');
  let list = [];
  if (raw) {
    try {
      list = JSON.parse(raw);
    } catch (_) {
      list = [];
    }
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
            item.url +
            '\n/tracklist · /untrack ' +
            (item.id || '')
        );
        alerts += 1;
        item.alertedAt = new Date().toISOString();
        // keep watching unless one-shot
        if (item.once) continue;
      }
      next.push(item);
    } catch (_) {
      next.push(item);
    }
  }

  await setSetting(client, 'track_list', JSON.stringify(next.slice(0, 40)));
  res.status(200).json({ ok: true, checked, alerts, remaining: next.length });
}
