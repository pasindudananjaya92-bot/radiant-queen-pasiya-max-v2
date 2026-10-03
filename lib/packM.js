/**
 * lib/packM.js — Pack N CODE TRAINING (RSS CDATA fix)
 * RSS parse, quote text card, voice-mode helpers
 */

/**
 * Unwrap CDATA sections then strip tags.
 * Critical: HN RSS uses <title><![CDATA[...]]></title>
 * Naive <[^>]+> strip would DELETE the entire CDATA payload.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  let s = String(html || '');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * @param {string} block
 * @param {string} tag
 */
function tagText(block, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = block.match(re);
  return m ? stripHtml(m[1]) : '';
}

/**
 * @param {string} feedUrl
 * @param {number} [limit]
 */
export async function fetchRss(feedUrl, limit = 8) {
  let u = String(feedUrl || '').trim();
  if (!u) return { ok: false, error: 'empty url' };
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const res = await fetch(u, {
      headers: {
        'User-Agent': 'RadiantQueenBot/4.0 RSS (+https://t.me/PasiyaMaxQueen_bot)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const xml = await res.text();
    if (!xml || xml.length < 20) return { ok: false, error: 'empty body' };

    const channelTitle =
      tagText(xml, 'title') ||
      stripHtml((xml.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') ||
      u;

    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < limit) {
      const block = m[1];
      const title = tagText(block, 'title');
      let link = tagText(block, 'link');
      if (!link) {
        const lm = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (lm) link = lm[1];
      }
      const summary = tagText(block, 'description') || tagText(block, 'summary') || '';
      if (title) items.push({ title, link, summary: summary.slice(0, 200) });
    }

    if (!items.length) {
      const entRe = /<entry>([\s\S]*?)<\/entry>/gi;
      while ((m = entRe.exec(xml)) && items.length < limit) {
        const block = m[1];
        const title = tagText(block, 'title');
        const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        const link = linkMatch ? linkMatch[1] : tagText(block, 'link');
        const summary = tagText(block, 'summary') || tagText(block, 'content') || '';
        if (title) items.push({ title, link, summary: summary.slice(0, 200) });
      }
    }

    if (!items.length) return { ok: false, error: 'No items parsed' };
    return { ok: true, title: channelTitle.slice(0, 120), items };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

export function formatQuoteCard(text, author) {
  const q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const a = String(author || 'Radiant Queen').slice(0, 40);
  const bar = '─'.repeat(Math.min(28, Math.max(12, Math.floor(q.length / 3))));
  return (
    '╭' + bar + '╮\n' +
    '│ 💬 QUOTE CARD\n' +
    '│\n' +
    '│ "' + q + '"\n' +
    '│\n' +
    '│ — ' + a + '\n' +
    '╰' + bar + '╯'
  );
}

export function detectTranslateTarget(text) {
  if (/[\u0D80-\u0DFF]/.test(text)) return 'en';
  return 'si';
}

/** Never returns "auto" (MyMemory rejects it). */
export function detectTranslateSource(text) {
  const t = String(text || '');
  if (/[\u0D80-\u0DFF]/.test(t)) return 'si';
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  return 'en';
}

export default {
  stripHtml,
  fetchRss,
  formatQuoteCard,
  detectTranslateTarget,
  detectTranslateSource,
};
