/**
 * api/cron-digest.js
 * Daily founder digest → Telegram ADMIN_ID
 * Auth: Bearer CRON_SECRET | ?secret= | x-cron-secret
 * Vercel Hobby: once per day (see vercel.json)
 * Manual test:
 *   /api/cron-digest?secret=YOUR_CRON_SECRET
 */
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const CRON_SECRET = process.env.CRON_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
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

async function tgSend(chatId, text) {
  if (!BOT_TOKEN || !chatId) return { ok: false, error: 'missing' };
  const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 3500),
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.ok, raw: j };
}

export default async function handler(req, res) {
  try {
    if (!authorized(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    if (!ADMIN_ID) {
      return res.status(500).json({ ok: false, error: 'ADMIN_ID missing' });
    }
    const client = sb();
    const lines = [
      '📬 DAILY DIGEST · Radiant Queen',
      'Time: ' + new Date().toISOString(),
      '',
    ];
    if (!client) {
      lines.push('Supabase offline.');
    } else {
      let wallets = 0,
        premium = 0,
        goldSum = 0;
      try {
        const { data } = await client.from('rq_gold').select('gold, premium');
        if (data) {
          wallets = data.length;
          premium = data.filter((r) => r.premium).length;
          goldSum = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
        }
      } catch (_) {}
      let activeRem = 0,
        refs = 0,
        mem = 0,
        ev24 = 0;
      try {
        const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const a = await client
          .from('rq_reminders')
          .select('*', { count: 'exact', head: true })
          .eq('active', true);
        activeRem = a.count ?? 0;
        const b = await client.from('rq_referrals').select('*', { count: 'exact', head: true });
        refs = b.count ?? 0;
        const c = await client.from('rq_ai_memory').select('*', { count: 'exact', head: true });
        mem = c.count ?? 0;
        const d = await client
          .from('rq_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since24);
        ev24 = d.count ?? 0;
      } catch (_) {}
      lines.push('Wallets: ' + wallets + ' · Premium: ' + premium);
      lines.push('Gold total: ' + goldSum);
      lines.push('Active reminders: ' + activeRem);
      lines.push('Referrals: ' + refs);
      lines.push('AI memory rows: ' + mem);
      lines.push('Events (24h): ' + ev24);
      lines.push('');
      lines.push('Open: /pulse · /digest · /exportstats · /exportcsv');
      lines.push('Web: https://radiant-queen-pasiya-max-v2.vercel.app/bot/analytics.html');
    }
    const sent = await tgSend(ADMIN_ID, lines.join('\n'));
    return res.status(200).json({
      ok: true,
      sent: sent.ok,
      admin: ADMIN_ID,
      telegram: sent.raw || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
