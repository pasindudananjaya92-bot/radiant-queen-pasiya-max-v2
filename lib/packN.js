/**
 * lib/packN.js — Pack N helpers
 * QR decode, AI story prompt, weather alert level, voice-translate helpers
 */

/**
 * Decode QR code from a public image URL (free api.qrserver.com).
 * @param {string} imageUrl
 * @returns {Promise<{ok:boolean, data?:string, error?:string, provider?:string}>}
 */
export async function decodeQrFromUrl(imageUrl) {
  const u = String(imageUrl || '').trim();
  if (!u) return { ok: false, error: 'no image url' };
  try {
    const api =
      'https://api.qrserver.com/v1/read-qr-code/?fileurl=' + encodeURIComponent(u);
    const res = await fetch(api, {
      headers: { Accept: 'application/json', 'User-Agent': 'RadiantQueenBot/4.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    const sym = j?.[0]?.symbol?.[0];
    const data = sym?.data;
    if (!data) return { ok: false, error: sym?.error || 'No QR found' };
    return { ok: true, data: String(data).slice(0, 2000), provider: 'qrserver' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Sinhala children's story system prompt.
 * @param {string} topic
 * @returns {string}
 */
export function storyPrompt(topic) {
  return (
    "Write a short wholesome children's story in simple Sinhala (mix English only if needed). " +
    'Length: 8-14 short sentences. Friendly tone. Clear kind moral at the end. ' +
    'No violence, no scary content. Topic: ' +
    String(topic || 'මිතුරුකම').slice(0, 200)
  );
}

/**
 * Map Open-Meteo weather_code + precip to runner-friendly alert.
 * @param {number} code
 * @param {number} precip
 * @returns {{level:string, text:string, emoji:string}}
 */
export function weatherAlertLevel(code, precip) {
  const c = Number(code) || 0;
  const p = Number(precip) || 0;
  if (c >= 95)
    return { level: 'danger', emoji: '⛈️', text: 'Thunderstorm risk — delay outdoor run' };
  if (c >= 80 || p >= 5)
    return { level: 'warn', emoji: '🌧️', text: 'Heavy rain likely — waterproof gear' };
  if (c >= 61 || p >= 1)
    return { level: 'info', emoji: '🌦️', text: 'Light rain possible — plan easy route' };
  if (c >= 45)
    return { level: 'info', emoji: '🌫️', text: 'Fog/mist — reflective gear' };
  if (c >= 71)
    return { level: 'warn', emoji: '❄️', text: 'Snow/ice risk — careful footing' };
  return { level: 'ok', emoji: '✅', text: 'Conditions look manageable for outdoor activity' };
}

/**
 * Format admin list for safe mention (no mass @everyone spam).
 * @param {Array<{user?:{id:number,username?:string,first_name?:string,is_bot?:boolean}}>} admins
 * @returns {string}
 */
export function formatAdminMentions(admins) {
  const list = Array.isArray(admins) ? admins : [];
  const humans = list.filter((a) => a?.user && !a.user.is_bot);
  if (!humans.length) return 'No human admins found.';
  const lines = humans.slice(0, 30).map((a, i) => {
    const u = a.user;
    const tag = u.username ? '@' + u.username : (u.first_name || 'Admin') + ' (id:' + u.id + ')';
    return i + 1 + '. ' + tag;
  });
  return lines.join('\n');
}

export default {
  decodeQrFromUrl,
  storyPrompt,
  weatherAlertLevel,
  formatAdminMentions,
};
