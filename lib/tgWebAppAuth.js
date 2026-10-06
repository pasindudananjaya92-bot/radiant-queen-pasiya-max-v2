/**
 * Validate Telegram Mini App initData (HMAC-SHA256)
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
import crypto from 'crypto';

export function parseInitData(initData) {
  const params = new URLSearchParams(String(initData || ''));
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return data;
}

export function validateInitData(initData, botToken, maxAgeSec = 86400) {
  try {
    const token = String(botToken || '').trim();
    if (!token || !initData) return { ok: false, error: 'missing' };
    const params = new URLSearchParams(String(initData));
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'no hash' };
    params.delete('hash');
    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return { ok: false, error: 'bad hash' };
    const authDate = Number(params.get('auth_date') || 0);
    if (maxAgeSec && authDate && Date.now() / 1000 - authDate > maxAgeSec) {
      return { ok: false, error: 'expired' };
    }
    let user = null;
    try {
      user = JSON.parse(params.get('user') || 'null');
    } catch (_) {}
    return { ok: true, user, authDate };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export default { parseInitData, validateInitData };
