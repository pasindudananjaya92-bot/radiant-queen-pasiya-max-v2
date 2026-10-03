/**
 * lib/packP.js — Pack P-FIX (CODE TRAINING refactor)
 * oracle, ghost (queue), timecapsule (relative time + queue), twin, forgepage, morningdigest
 *
 * CRITICAL: NO setTimeout for delete/delivery on Vercel serverless.
 * Ghost + capsule delivery run via /api/cron-ghost (cron-job.org every 30–60s).
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

export function oraclePrompt(facts) {
  const f = facts || {};
  return (
    'You are Oracle of Radiant Queen / Pasiya Max. ' +
    'Given this runner profile, give a short practical forecast for the NEXT 7 DAYS. ' +
    'Include: (1) most productive day, (2) one caution, (3) one opportunity, (4) one habit tip. ' +
    'Match language (Sinhala if user facts look Sinhala-heavy, else English). Max 180 words. No astrology fluff.\n\n' +
    'Facts:\n' +
    JSON.stringify({
      xp: f.xp,
      runs: f.runs,
      streak: f.streak,
      stride: f.strideName,
      gold: f.gold,
      birthday: f.birthday,
      notes: f.notes,
    })
  );
}

/**
 * Parse duration: 15 | 30s | 5m | 2h | 3d → seconds
 */
export function parseDurationToSeconds(token) {
  const t = String(token || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.min(47 * 3600, Math.max(5, n)) : null;
  }
  const m = t.match(/^(\d+)(s|sec|secs|seconds|m|min|mins|minutes|h|hr|hrs|hours|d|day|days)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  let secs = n;
  if (u.startsWith('min') || u === 'm') secs = n * 60;
  else if (u.startsWith('h')) secs = n * 3600;
  else if (u.startsWith('d')) secs = n * 86400;
  else if (u.startsWith('s')) secs = n;
  return Math.min(47 * 3600, Math.max(5, secs));
}

/**
 * /ghost 30 secret | /ghost 5m hello
 */
export function parseGhostArgs(body) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\S+)\s+([\s\S]+)$/);
  if (!m) return null;
  const secs = parseDurationToSeconds(m[1]);
  const msg = m[2].trim();
  if (!secs || !msg) return null;
  return {
    secs,
    msg: msg.slice(0, 1500),
    deleteAt: new Date(Date.now() + secs * 1000).toISOString(),
  };
}

/**
 * open 2030-01-01 msg | open in 2m msg | in 2m msg | in 1h msg
 */
export function parseTimeCapsule(body) {
  const raw = String(body || '').trim();
  if (!raw) return null;

  let m = raw.match(/^(?:open\s+)?(\d{4}-\d{2}-\d{2})\s+([\s\S]+)$/i);
  if (m) {
    const unlock = new Date(m[1] + 'T12:00:00Z');
    if (Number.isNaN(unlock.getTime())) return { error: 'Invalid date' };
    if (unlock.getTime() < Date.now() + 30_000) return { error: 'Unlock must be in the future' };
    return { unlockAt: unlock.toISOString(), message: m[2].trim().slice(0, 2000) };
  }

  m = raw.match(/^(?:open\s+)?in\s+(\S+)\s+([\s\S]+)$/i);
  if (m) {
    const secs = parseDurationToSeconds(m[1]);
    if (!secs) return { error: 'Could not parse duration (try: in 2m, in 1h, in 3d)' };
    const unlock = new Date(Date.now() + secs * 1000);
    if (unlock.getTime() < Date.now() + 20_000) return { error: 'Minimum ~30 seconds' };
    return { unlockAt: unlock.toISOString(), message: m[2].trim().slice(0, 2000) };
  }

  return null;
}

export function sealMessage(text, key) {
  const k = String(key || 'rq');
  const t = String(text || '');
  const out = [];
  for (let i = 0; i < t.length; i++) {
    out.push(String.fromCharCode(t.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
  }
  return Buffer.from(out.join(''), 'binary').toString('base64');
}

export function unsealMessage(sealed, key) {
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

export function twinReplyPrompt(samples, incoming) {
  const s = (samples || []).slice(0, 8).map((x, i) => i + 1 + '. ' + x).join('\n');
  return (
    'You are writing AS the user (not as an assistant). Mimic their tone, length, emoji habits, and language. ' +
    'Reply to the incoming message in 1-4 short lines. No meta commentary.\n\n' +
    'Style samples from user:\n' +
    (s || '(none — use casual friendly tone)') +
    '\n\nIncoming:\n' +
    String(incoming || '').slice(0, 500)
  );
}

export function forgePageHtml(brief, title) {
  const t = String(title || 'Radiant Page').slice(0, 80);
  const b = String(brief || 'Welcome').slice(0, 1200);
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(t)}</title>
<style>
:root{--bg:#0b1020;--card:#151b2e;--accent:#7c5cff;--text:#e8ecf8;--muted:#9aa3c0}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(160deg,#0b1020,#1a1240);color:var(--text);min-height:100vh}
.wrap{max-width:720px;margin:0 auto;padding:48px 20px}
.card{background:var(--card);border:1px solid #2a3350;border-radius:16px;padding:28px}
h1{margin:0 0 8px;font-size:1.8rem}
.badge{display:inline-block;background:rgba(124,92,255,.2);color:#cbb8ff;padding:4px 10px;border-radius:999px;font-size:.75rem;margin-bottom:16px}
p{line-height:1.6;color:var(--muted);white-space:pre-wrap}
.cta{display:inline-block;margin-top:20px;background:var(--accent);color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600}
footer{margin-top:28px;font-size:.75rem;color:#6b7390;text-align:center}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<div class="badge">Forged by Radiant Queen · Pasiya Max</div>
<h1>${esc(t)}</h1>
<p>${esc(b)}</p>
<a class="cta" href="https://t.me/PasiyaMaxQueen_bot">Open bot</a>
</div>
<footer>Generated free · Pack P /forgepage</footer>
</div></body></html>`;
}

export function morningDigestPrompt(items) {
  const lines = (items || [])
    .slice(0, 8)
    .map((it, i) => i + 1 + '. ' + it.title + (it.link ? ' (' + it.link + ')' : ''))
    .join('\n');
  return (
    'Write a short morning news digest for a Sri Lankan runner community (Radiant Queen / StrideClub). ' +
    'Sinhala-friendly or mixed. 6-10 lines. Friendly tone. End with one motivation line.\n\nHeadlines:\n' +
    lines
  );
}

export async function fetchDigestFeed(feedUrl) {
  const u = feedUrl || 'https://hnrss.org/frontpage';
  try {
    const res = await fetch(u, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const xml = await res.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) && items.length < 8) {
      const block = m[1];
      let title = (block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      let link = (block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
      link = link.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/<[^>]+>/g, '').trim();
      if (title) items.push({ title, link });
    }
    return { ok: items.length > 0, items };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}

export function enqueueGhost(list, item) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.push({
    chatId: String(item.chatId),
    messageId: Number(item.messageId),
    deleteAt: item.deleteAt,
    userId: String(item.userId || ''),
  });
  return arr.slice(-80);
}

export function dueGhosts(list, nowMs) {
  const now = nowMs || Date.now();
  const due = [];
  const keep = [];
  for (const g of Array.isArray(list) ? list : []) {
    if (!g || !g.deleteAt) continue;
    if (new Date(g.deleteAt).getTime() <= now) due.push(g);
    else keep.push(g);
  }
  return { due, keep };
}

export default {
  oraclePrompt,
  parseDurationToSeconds,
  parseGhostArgs,
  parseTimeCapsule,
  sealMessage,
  unsealMessage,
  twinReplyPrompt,
  forgePageHtml,
  morningDigestPrompt,
  fetchDigestFeed,
  enqueueGhost,
  dueGhosts,
};
