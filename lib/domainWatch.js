/**
 * /domain — HTTP/uptime watchdog for founder sites
 */
const DEFAULTS = [
  'https://radiant-queen-pasiya-max-v2.vercel.app/api/health',
  'https://radiant-queen-pasiya-max-v2.vercel.app/',
];

export async function checkDomains(urls = []) {
  const list = (urls.length ? urls : DEFAULTS).slice(0, 8);
  const results = [];
  for (const url of list) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'PasiyaOS-DomainWatch/1.0' },
      });
      clearTimeout(timer);
      results.push({
        url,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - t0,
      });
    } catch (e) {
      results.push({
        url,
        ok: false,
        status: 0,
        ms: Date.now() - t0,
        error: String(e.message || e).slice(0, 80),
      });
    }
  }
  return { ok: true, results };
}

export function formatDomain(r) {
  if (!r.ok) return '❌ Domain: fail';
  return (
    '🌐 DOMAIN WATCH\n' +
    r.results
      .map(
        (x) =>
          `${x.ok ? '✅' : '❌'} ${x.status || 'ERR'} ${x.ms}ms\n   ${x.url}` +
          (x.error ? `\n   ${x.error}` : '')
      )
      .join('\n')
  ).slice(0, 3500);
}

export default { checkDomains, formatDomain };
