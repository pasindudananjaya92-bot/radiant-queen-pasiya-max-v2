/**
 * api/cron-reminders.js
 * Vercel Cron or external ping:
 *   GET /api/cron-reminders?secret=CRON_SECRET
 * Sends due reminders via Telegram + ntfy
 */
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function tgSend(chatId, text) {
  if (!BOT_TOKEN) return;
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 3500),
    }),
  });
}

async function ntfy(userId, text) {
  try {
    const topic =
      process.env.NTFY_TOPIC ||
      ('radiant-queen-' + String(userId || 'public')).replace(/[^a-zA-Z0-9_-]/g, '');
    await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
      method: 'POST',
      headers: { Title: 'Radiant Queen Reminder', Tags: 'alarm_clock' },
      body: String(text).slice(0, 1000),
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  try {
    const secret = req.query?.secret || req.headers['x-cron-secret'] || '';
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const sb = supabaseAdmin();
    if (!sb) return res.status(500).json({ ok: false, error: 'supabase missing' });

    const { fetchDueReminders, markReminderDone } = await import('../lib/reminders.js');
    const due = await fetchDueReminders(sb, new Date().toISOString());
    const results = [];
    for (const row of due) {
      const msg = '⏰ Reminder: ' + (row.message || '');
      try {
        await tgSend(row.chat_id, msg);
        await ntfy(row.user_id, msg);
        await markReminderDone(sb, row);
        results.push({ id: row.id, ok: true });
      } catch (e) {
        results.push({ id: row.id, ok: false, error: String(e.message || e) });
      }
    }
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
