/**
 * lib/packK.js — Pack K helpers
 * Birthdays, crypto FX (CoinGecko), channel post helpers
 */

/**
 * @param {string} text
 * @returns {{ name: string, date: string } | null}
 */
export function parseBirthdayAdd(text) {
  const raw = String(text || '').trim();
  // formats: 1998-05-20 Name | 20/05 Name | 20-05 Name
  let m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  if (m) return { date: m[1], name: m[2].trim().slice(0, 80) };
  m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(.+)$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2000';
    return { date: `${yyyy}-${mm}-${dd}`, name: m[4].trim().slice(0, 80) };
  }
  m = raw.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})$/);
  if (m) return { date: m[2], name: m[1].trim().slice(0, 80) };
  return null;
}

/**
 * @param {Array<{name:string,date:string,addedBy?:string}>} list
 * @param {number} withinDays
 */
export function upcomingBirthdays(list, withinDays = 30) {
  const now = new Date();
  const out = [];
  for (const b of list || []) {
    if (!b?.date || !b?.name) continue;
    const parts = String(b.date).split('-');
    if (parts.length < 3) continue;
    let next = new Date(now.getFullYear(), Number(parts[1]) - 1, Number(parts[2]));
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      next = new Date(now.getFullYear() + 1, Number(parts[1]) - 1, Number(parts[2]));
    }
    const diff = Math.round((next - now) / 86400000);
    if (diff >= 0 && diff <= withinDays) {
      out.push({ ...b, inDays: diff, nextDate: next.toISOString().slice(0, 10) });
    }
  }
  out.sort((a, b) => a.inDays - b.inDays);
  return out;
}

/**
 * CoinGecko free — no key
 * @param {string} id e.g. bitcoin
 * @param {string} vs e.g. usd
 */
export async function fetchCryptoPrice(id, vs = 'usd') {
  const coin = String(id || 'bitcoin').toLowerCase().trim();
  const map = {
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
    doge: 'dogecoin',
    xrp: 'ripple',
    ada: 'cardano',
    bnb: 'binancecoin',
    usdt: 'tether',
    usdc: 'usd-coin',
  };
  const binanceMap = {
    btc: 'BTCUSDT',
    bitcoin: 'BTCUSDT',
    eth: 'ETHUSDT',
    ethereum: 'ETHUSDT',
    sol: 'SOLUSDT',
    solana: 'SOLUSDT',
    doge: 'DOGEUSDT',
    dogecoin: 'DOGEUSDT',
    xrp: 'XRPUSDT',
    ripple: 'XRPUSDT',
    ada: 'ADAUSDT',
    cardano: 'ADAUSDT',
    bnb: 'BNBUSDT',
    binancecoin: 'BNBUSDT',
  };
  const cid = map[coin] || coin;
  const vsC = String(vs || 'usd').toLowerCase();

  // 1) CoinGecko
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=' +
      encodeURIComponent(cid) +
      '&vs_currencies=' +
      encodeURIComponent(vsC) +
      '&include_24hr_change=true';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RadiantQueenBot/4.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const j = await res.json();
      const row = j[cid];
      if (row && row[vsC] != null) {
        return {
          ok: true,
          id: cid,
          vs: vsC,
          price: row[vsC],
          change24h: row[vsC + '_24h_change'],
          provider: 'coingecko',
        };
      }
    }
  } catch (_) {}

  // 2) Binance public (USDT pairs) — no key
  const symbol = binanceMap[coin] || binanceMap[cid];
  if (symbol && (vsC === 'usd' || vsC === 'usdt')) {
    try {
      const res = await fetch(
        'https://api.binance.com/api/v3/ticker/24hr?symbol=' + symbol,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        }
      );
      if (res.ok) {
        const j = await res.json();
        if (j.lastPrice) {
          return {
            ok: true,
            id: cid,
            vs: 'usdt',
            price: Number(j.lastPrice),
            change24h: j.priceChangePercent != null ? Number(j.priceChangePercent) : null,
            provider: 'binance',
          };
        }
      }
    } catch (_) {}
  }

  return { ok: false, error: 'price unavailable (try btc/eth/sol)' };
}

export default {
  parseBirthdayAdd,
  upcomingBirthdays,
  fetchCryptoPrice,
};
