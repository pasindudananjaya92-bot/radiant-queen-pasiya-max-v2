/**
 * lib/resendMail.js — Pack C
 * Free tier: https://resend.com (3000 emails/mo)
 * Env:
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM=Radiant Queen <onboarding@resend.dev>
 *     (use your verified domain later: Pasiya <bot@yourdomain.com>)
 */
const API = 'https://api.resend.com/emails';

export function resendConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || '').trim());
}

export function defaultFrom() {
  return (
    String(process.env.RESEND_FROM || '').trim() ||
    'Radiant Queen <onboarding@resend.dev>'
  );
}

/**
 * @param {{ to: string|string[], subject: string, text?: string, html?: string }} opts
 */
export async function sendResendEmail(opts) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'RESEND_API_KEY missing' };
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const cleanTo = to.map((t) => String(t || '').trim()).filter(Boolean);
  if (!cleanTo.length) return { ok: false, error: 'No recipient' };
  if (!opts.subject) return { ok: false, error: 'No subject' };

  const body = {
    from: defaultFrom(),
    to: cleanTo,
    subject: String(opts.subject).slice(0, 200),
  };
  if (opts.html) body.html = String(opts.html);
  if (opts.text) body.text = String(opts.text);
  if (!body.html && !body.text) body.text = '(empty)';

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error?.message ||
      json?.error ||
      ('HTTP ' + res.status);
    return { ok: false, error: String(msg).slice(0, 250), status: res.status };
  }
  return { ok: true, id: json?.id || null, raw: json };
}

export async function getEmailPref(supabase, userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('rq_email_prefs')
    .select('*')
    .eq('user_id', Number(userId))
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function upsertEmailPref(supabase, userId, fields) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const row = {
    user_id: Number(userId),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  const { data, error } = await supabase
    .from('rq_email_prefs')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pref: data };
}

export async function listDigestEmails(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('rq_email_prefs')
    .select('user_id, email, digest_enabled')
    .eq('digest_enabled', true)
    .not('email', 'is', null);
  if (error) return [];
  return (data || []).filter((r) => r.email && String(r.email).includes('@'));
}

export function buildDigestHtml(stats) {
  const s = stats || {};
  return (
    '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:16px">' +
    '<h2 style="margin:0 0 8px">📬 Radiant Queen Digest</h2>' +
    '<p style="color:#666;margin:0 0 16px">' +
    new Date().toISOString() +
    '</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
    row('Wallets', s.wallets) +
    row('Premium', s.premium) +
    row('Gold total', s.goldSum) +
    row('Active reminders', s.activeRem) +
    row('Referrals', s.refs) +
    row('AI memory rows', s.mem) +
    row('Events (24h)', s.ev24) +
    '</table>' +
    '<p style="margin-top:20px"><a href="https://t.me/PasiyaMaxQueen_bot">Open Telegram bot</a> · ' +
    '<a href="https://radiant-queen-pasiya-max-v2.vercel.app/bot/">Web hub</a></p>' +
    '<p style="color:#999;font-size:12px">Unsubscribe: in bot send /emailoff</p>' +
    '</div>'
  );
}

function row(k, v) {
  return (
    '<tr><td style="padding:6px 0;border-bottom:1px solid #eee">' +
    k +
    '</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right"><b>' +
    (v ?? '—') +
    '</b></td></tr>'
  );
}

export async function collectDigestStats(supabase) {
  const stats = {
    wallets: 0,
    premium: 0,
    goldSum: 0,
    activeRem: 0,
    refs: 0,
    mem: 0,
    ev24: 0,
  };
  if (!supabase) return stats;
  try {
    const { data } = await supabase.from('rq_gold').select('gold, premium');
    if (data) {
      stats.wallets = data.length;
      stats.premium = data.filter((r) => r.premium).length;
      stats.goldSum = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
    }
  } catch (_) {}
  try {
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const a = await supabase
      .from('rq_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    stats.activeRem = a.count ?? 0;
    const b = await supabase.from('rq_referrals').select('*', { count: 'exact', head: true });
    stats.refs = b.count ?? 0;
    const c = await supabase.from('rq_ai_memory').select('*', { count: 'exact', head: true });
    stats.mem = c.count ?? 0;
    const d = await supabase
      .from('rq_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since24);
    stats.ev24 = d.count ?? 0;
  } catch (_) {}
  return stats;
}

export default {
  resendConfigured,
  sendResendEmail,
  getEmailPref,
  upsertEmailPref,
  listDigestEmails,
  buildDigestHtml,
  collectDigestStats,
};
