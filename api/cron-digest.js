/**
 * api/cron-digest.js — Pack C enhanced
 * Daily:
 *  1) Telegram → ADMIN_ID (existing)
 *  2) Email → all rq_email_prefs where digest_enabled=true (Resend)
 *
 * Auth: Bearer CRON_SECRET | ?secret= | x-cron-secret
 * Manual: /api/cron-digest?secret=YOUR_CRON_SECRET
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
    const client = sb();
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
      'Wallets: ' + stats.wallets + ' · Premium: ' + stats.premium,
      'Gold total: ' + stats.goldSum,
      'Active reminders: ' + stats.activeRem,
      'Referrals: ' + stats.refs,
      'AI memory rows: ' + stats.mem,
      'Events (24h): ' + stats.ev24,
      '',
      'Open: /pulse · /digest · /emailstatus',
      'Web: https://radiant-queen-pasiya-max-v2.vercel.app/bot/analytics.html',
    ];

    let tgOk = false;
    if (ADMIN_ID) {
      const sent = await tgSend(ADMIN_ID, lines.join('\n'));
      tgOk = !!sent.ok;
    }

    const emailResults = [];
    if (resendConfigured() && client) {
      const recipients = await listDigestEmails(client);
      const html = buildDigestHtml(stats);
      const text = lines.join('\n');
      for (const r of recipients.slice(0, 50)) {
        try {
          const out = await sendResendEmail({
            to: r.email,
            subject: 'Radiant Queen · Daily Digest',
            text,
            html,
          });
          emailResults.push({ user_id: r.user_id, email: r.email, ok: out.ok, error: out.error || null });
        } catch (e) {
          emailResults.push({
            user_id: r.user_id,
            email: r.email,
            ok: false,
            error: String(e.message || e),
          });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      telegram: tgOk,
      admin: ADMIN_ID || null,
      emailConfigured: resendConfigured(),
      emailsSent: emailResults.filter((x) => x.ok).length,
      emailResults,
      stats,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
