/**
 * lib/packM.js — Pack M helpers
 * RSS parse, quote text card, voice-mode helpers
 */

/**
 * Strip HTML tags lightly for RSS.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  return String(html || '')
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
}

/**
 * Fetch and parse RSS/Atom (best-effort, no deps).
 * @param {string} feedUrl
 * @param {number} [limit]
 * @returns {Promise<{ok:boolean, title?:string, items?:Array<{title:string,link:string,summary:string}>, error?:string}>}
 */
export async function fetchRss(feedUrl, limit = 8) {
  let u = String(feedUrl || '').trim();
  if (!u) return { ok: false, error: 'empty url' };
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const res = await fetch(u, {
      headers: {
        'User-Agent': 'RadiantQueenBot/4.0 RSS',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const xml = await res.text();
    const channelTitle =
      stripHtml((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/i) || [])[1] || '') ||
      stripHtml((xml.match(/<feed[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/i) || [])[1] || '') ||
      u;

    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < limit) {
      const block = m[1];
      const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
      const link = stripHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
      const summary = stripHtml(
        (block.match(/<description>([\s\S]*?)<\/description>/i) ||
          block.match(/<summary>([\s\S]*?)<\/summary>/i) ||
          [])[1] || ''
      );
      if (title) items.push({ title, link, summary: summary.slice(0, 200) });
    }
    // Atom entries
    if (!items.length) {
      const entRe = /<entry>([\s\S]*?)<\/entry>/gi;
      while ((m = entRe.exec(xml)) && items.length < limit) {
        const block = m[1];
        const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
        const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        const link = linkMatch ? linkMatch[1] : '';
        const summary = stripHtml(
          (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
            block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) ||
            [])[1] || ''
        );
        if (title) items.push({ title, link, summary: summary.slice(0, 200) });
      }
    }
    if (!items.length) return { ok: false, error: 'No items parsed' };
    return { ok: true, title: channelTitle, items };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Pure-text quote card (no AI image — avoids garbled letters).
 * @param {string} text
 * @param {string} [author]
 * @returns {string}
 */
export function formatQuoteCard(text, author) {
  const q = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  const a = String(author || 'Radiant Queen').slice(0, 40);
  const bar = '─'.repeat(Math.min(28, Math.max(12, Math.floor(q.length / 3))));
  return (
    '╭' +
    bar +
    '╮\n' +
    '│ 💬 QUOTE CARD\n' +
    '│\n' +
    '│ "' +
    q +
    '"\n' +
    '│\n' +
    '│ — ' +
    a +
    '\n' +
    '╰' +
    bar +
    '╯'
  );
}

/**
 * @param {string} text
 * @returns {string}
 */
export function detectTranslateTarget(text) {
  if (/[\u0D80-\u0DFF]/.test(text)) return 'en';
  return 'si';
}

export default {
  stripHtml,
  fetchRss,
  formatQuoteCard,
  detectTranslateTarget,
};
