/**
 * Wave 30B — Free Wikipedia brain (no API key)
 * Mobile-safe summaries for Founder research / lab offline fallback.
 */
export const VERSION = '30B';

export function wikiHelp() {
  return [
    '📚 *Wiki · ' + VERSION + '* (free · no key)',
    '• `wiki <topic>` — short summary + URL',
    '• `wiki help` — this menu',
    '',
    'Uses Wikipedia REST API. No API key. Free forever.',
    '_Pair with `lab research` / `architect plan`._',
  ].join('\n');
}

export async function wikiSummary(topic) {
  const q = String(topic || '').trim();
  if (!q) return 'Usage: `wiki <topic>`';
  const title = encodeURIComponent(q.replace(/\s+/g, '_'));
  const url =
    'https://en.wikipedia.org/api/rest_v1/page/summary/' + title;
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'QueenOS/30B (mobile founder bot)' },
    });
    if (r.status === 404) {
      const search =
        'https://en.wikipedia.org/w/api.php?action=opensearch&search=' +
        encodeURIComponent(q) +
        '&limit=5&namespace=0&format=json';
      const s = await fetch(search, {
        headers: { 'User-Agent': 'QueenOS/30B' },
      });
      const data = await s.json();
      const names = data?.[1] || [];
      if (!names.length) return '📚 No Wikipedia hit for: ' + q;
      return (
        '📚 No exact page. Try:\n' +
        names.map((n) => '· `wiki ' + n + '`').join('\n')
      );
    }
    if (!r.ok) return '📚 Wiki HTTP ' + r.status;
    const j = await r.json();
    const extract = String(j.extract || '').slice(0, 1200);
    const page = j.content_urls?.desktop?.page || j.content_urls?.mobile?.page || '';
    return [
      '📚 *' + (j.title || q) + '*',
      j.description ? '_' + j.description + '_' : '',
      '',
      extract || '(no extract)',
      page ? '\n🔗 ' + page : '',
    ]
      .filter(Boolean)
      .join('\n');
  } catch (e) {
    return '📚 Wiki error: ' + (e.message || e);
  }
}

export default { wikiHelp, wikiSummary, VERSION };
