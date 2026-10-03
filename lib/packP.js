/**
 * lib/packP.js — Pack P helpers
 * oracle, ghost, timecapsule, twin, forgepage, morningdigest
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

/**
 * Build oracle analysis prompt from profile-ish facts.
 * @param {object} facts
 */
export function oraclePrompt(facts) {
  const f = facts || {};
  return (
    'You are Oracle of Radiant Queen / Pasiya Max. ' +
    'Given this runner profile, give a short practical forecast for the NEXT 7 DAYS. ' +
    'Include: (1) most productive day, (2) one caution, (3) one opportunity, (4) one habit tip. ' +
    'Match language (Sinhala if user facts look Sinhala-heavy, else English). Max 180 words. No astrology fluff.\n\n' +
    'Facts:\n' +
    JSON.stringify(
      {
        xp: f.xp,
        runs: f.runs,
        streak: f.streak,
        stride: f.strideName,
        gold: f.gold,
        birthday: f.birthday,
        notes: f.notes,
      },
      null,
      0
    )
  );
}

/**
 * Parse ghost args: seconds + message
 * /ghost 30 secret text
 * /ghost 5m hello
 * @param {string} body
 */
export function parseGhostArgs(body) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  let secs = 30;
  let msg = raw;
  const m = raw.match(/^(\d+)\s*(s|sec|secs|m|min|mins)?\s+([\s\S]+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = (m[2] || 's').toLowerCase();
    if (unit.startsWith('m')) secs = Math.min(3600, Math.max(5, n * 60));
    else secs = Math.min(3600, Math.max(5, n));
    msg = m[3].trim();
  }
  if (!msg) return null;
  return { secs, msg: msg.slice(0, 1500) };
}

/**
 * Parse timecapsule: open YYYY-MM-DD message...
 * or open in 30d message
 * @param {string} body
 */
export function parseTimeCapsule(body) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  // open 2030-01-01 text
  let m = raw.match(/^open\s+(\d{4}-\d{2}-\d{2})\s+([\s\S]+)$/i);
  if (m) {
    const unlock = new Date(m[1] + 'T00:00:00Z');
    if (Number.isNaN(unlock.getTime())) return null;
    if (unlock.getTime() < Date.now() + 60_000) return { error: 'Unlock date must be in the future' };
    return {
      unlockAt: unlock.toISOString(),
      message: m[2].trim().slice(0, 2000),
    };
  }
  // open in 30d text | open in 2h text
  m = raw.match(/^open\s+in\s+(\d+)\s*(d|day|days|h|hr|hours|m|min)?\s+([\s\S]+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = (m[2] || 'd').toLowerCase();
    let ms = n * 86400000;
    if (u.startsWith('h')) ms = n * 3600000;
    else if (u.startsWith('m')) ms = n * 60000;
    ms = Math.min(ms, 10 * 365 * 86400000); // max ~10y
    if (ms < 60000) return { error: 'Minimum 1 minute' };
    const unlock = new Date(Date.now() + ms);
    return {
      unlockAt: unlock.toISOString(),
      message: m[3].trim().slice(0, 2000),
    };
  }
  return null;
}

/**
 * Simple obfuscation (not military crypto — clear disclaimer).
 * @param {string} text
 * @param {string} key
 */
export function sealMessage(text, key) {
  const k = String(key || 'rq');
  const t = String(text || '');
  const out = [];
  for (let i = 0; i < t.length; i++) {
    out.push(String.fromCharCode(t.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
  }
  return Buffer.from(out.join(''), 'binary').toString('base64');
}

/**
 * @param {string} sealed
 * @param {string} key
 */
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

/**
 * Twin style samples prompt.
 * @param {string[]} samples
 * @param {string} incoming
 */
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

/**
 * Generate a single-file HTML portfolio/landing page.
 * @param {string} brief
 * @param {string} title
 */
export function forgePageHtml(brief, title) {
  const t = String(title || 'Radiant Page').slice(0, 80);
  const b = String(brief || 'Welcome').slice(0, 1200);
  // Escape for HTML text nodes
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(t)}</title>
<style>
:root{--bg:#0b1020;--card:#151b2e;--accent:#7c5cff;--text:#e8ecf8;--muted:#9aa3c0}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(160deg,#0b1020,#1a1240);color:var(--text);min-height:100vh}
.wrap{max-width:720px;margin:0 auto;padding:48px 20px}
.card{background:var(--card);border:1px solid #2a3350;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
h1{margin:0 0 8px;font-size:1.8rem;letter-spacing:-.02em}
.badge{display:inline-block;background:rgba(124,92,255,.2);color:#cbb8ff;padding:4px 10px;border-radius:999px;font-size:.75rem;margin-bottom:16px}
p{line-height:1.6;color:var(--muted);white-space:pre-wrap}
.cta{display:inline-block;margin-top:20px;background:var(--accent);color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600}
footer{margin-top:28px;font-size:.75rem;color:#6b7390;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="badge">Forged by Radiant Queen · Pasiya Max</div>
    <h1>${esc(t)}</h1>
    <p>${esc(b)}</p>
    <a class="cta" href="https://t.me/PasiyaMaxQueen_bot">Open bot</a>
  </div>
  <footer>Generated free · Pack P /forgepage</footer>
</div>
</body>
</html>`;
}

/**
 * Morning digest prompt from headlines.
 * @param {Array<{title:string,link?:string}>} items
 */
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

/**
 * Fetch a simple free RSS for digest (reuse HN or Google News).
 * @param {string} [feedUrl]
 */
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

export default {
  oraclePrompt,
  parseGhostArgs,
  parseTimeCapsule,
  sealMessage,
  unsealMessage,
  twinReplyPrompt,
  forgePageHtml,
  morningDigestPrompt,
  fetchDigestFeed,
};
