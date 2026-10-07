import crypto from 'node:crypto';

export function validateInitData(initData, botToken, maxAgeSec = 86400 * 7) {
  try {
    const token = String(botToken || '').trim();
    const raw = String(initData || '');
    if (!token) return { ok: false, error: 'BOT_TOKEN missing on server' };
    if (!raw) return { ok: false, error: 'initData empty — open from Telegram /desktop' };

    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'initData missing hash' };
    params.delete('hash');

    const pairs = [];
    for (const [k, v] of params.entries()) pairs.push(k + '=' + v);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return { ok: false, error: 'bad initData hash (BOT_TOKEN mismatch?)' };

    const authDate = Number(params.get('auth_date') || 0);
    if (maxAgeSec && authDate && Date.now() / 1000 - authDate > maxAgeSec) {
      return { ok: false, error: 'initData expired — close & reopen Mini App' };
    }

    let user = null;
    try {
      user = JSON.parse(params.get('user') || 'null');
    } catch (_) {}
    return { ok: true, user, authDate };
  } catch (e) {
    return { ok: false, error: 'auth exception: ' + String(e.message || e) };
  }
}

export default { validateInitData };
