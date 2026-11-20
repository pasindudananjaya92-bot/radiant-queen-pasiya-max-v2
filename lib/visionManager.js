/**
 * Wave 31A — Vision Scan (Vercel Hobby ~10s)
 * Strategy:
 *  - Use SMALLEST Telegram size >= ~25KB (readable, fast)
 *  - Hard wall-clock budget ~5.5s
 *  - Ultra-short prompt + maxOutputTokens 500
 *  - Prefer flash-lite model ids first
 *  - Early reject if download buffer still large
 */
export const VERSION = '31A';

const HARD_MS = Math.min(
  8000,
  Math.max(3500, Number(process.env.VISION_TIMEOUT_MS || 5500) || 5500)
);

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';

// Fast models first (names may 404 — we skip quickly)
const GEMINI_MODELS = (
  process.env.VISION_GEMINI_MODEL ||
  'gemini-2.0-flash-lite,gemini-2.0-flash,gemini-1.5-flash-8b,gemini-1.5-flash,gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash'
)
  .split(',')
  .map((s) => s.trim().replace(/^models\//, ''))
  .filter(Boolean);

export function visionHelp() {
  return [
    '👁 *Vision Scan · ' + VERSION + '*',
    'Hobby-safe screenshot OCR (target <6s)',
    '',
    '• Photo + caption: `scan` / `explain` / `කියවන්න`',
    '• `vision help` — this menu',
    '',
    'Tips for success on Hobby:',
    '· Crop to the important area (not full desktop)',
    '· Prefer bright UI text screenshots',
    '· Budget ~' + Math.round(HARD_MS / 1000) + 's wall clock',
    '',
    '_If still timeout → crop smaller; system will not hang._',
  ].join('\n');
}

function systemPrompt() {
  return (
    'Queen Vision. Mobile Founder. Max 180 words. ' +
    '1) What 2) Key text/numbers/URLs 3) 2 actions 4) USEFUL|SKIP|FOUNDER. No invention.'
  );
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label || 'timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/**
 * Prefer smallest Telegram photo that is still useful.
 * Telegram sends sizes ascending; skip tiny thumbnails (<12KB).
 */
export function pickTelegramPhoto(photos = []) {
  const arr = Array.isArray(photos) ? photos.slice() : [];
  if (!arr.length) return null;
  const sorted = arr.slice().sort((a, b) => (a.file_size || 0) - (b.file_size || 0));
  // Prefer ~15KB–180KB band
  const band = sorted.filter((p) => {
    const s = p.file_size || 0;
    return s >= 12000 && s <= 180000;
  });
  if (band.length) return band[0];
  // else smallest non-trivial
  const ok = sorted.filter((p) => (p.file_size || 0) >= 8000);
  if (ok.length) return ok[0];
  return sorted[0];
}

async function geminiVision({ mime, base64, userText, deadlineMs }) {
  const key = GEMINI_KEY();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY missing' };
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt() + '\n' + (userText || 'Scan.') },
          { inline_data: { mime_type: mime || 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500,
    },
  };
  let lastErr = '';
  const t0 = Date.now();
  for (const model of GEMINI_MODELS) {
    const left = deadlineMs - (Date.now() - t0);
    if (left < 900) break;
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const r = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        Math.min(left, 4500),
        'gemini_http_timeout'
      );
      if (!r.ok) {
        lastErr = 'HTTP ' + r.status + ' ' + model;
        // skip missing models fast
        if (r.status === 404 || r.status === 400) continue;
        const errText = await r.text().catch(() => '');
        lastErr = (lastErr + ' ' + errText).slice(0, 180);
        continue;
      }
      const j = await r.json();
      const text = (j?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) {
        lastErr = 'empty ' + model;
        continue;
      }
      return {
        ok: true,
        text,
        provider: model,
        ms: Date.now() - t0,
      };
    } catch (e) {
      lastErr = e.message || String(e);
      if (/timeout/i.test(lastErr)) break;
    }
  }
  return { ok: false, error: lastErr || 'all models failed' };
}

export async function scanFromTelegramFile({ botToken, fileId, caption }) {
  const t0 = Date.now();
  const budget = HARD_MS;
  try {
    if (!botToken || !fileId) return { ok: false, error: 'missing token/file' };
    const metaUrl =
      'https://api.telegram.org/bot' + botToken + '/getFile?file_id=' + encodeURIComponent(fileId);
    const meta = await withTimeout(fetch(metaUrl), Math.min(2500, budget), 'tg_meta_timeout');
    const mj = await meta.json();
    if (!mj.ok || !mj.result?.file_path) {
      return { ok: false, error: 'Telegram getFile failed' };
    }
    const path = mj.result.file_path;
    const left = budget - (Date.now() - t0);
    if (left < 1200) {
      return {
        ok: false,
        error:
          'Image scan took too long (Vercel Hobby limit). Crop the screenshot and retry.',
      };
    }
    const fileUrl = 'https://api.telegram.org/file/bot' + botToken + '/' + path;
    const bin = await withTimeout(
      fetch(fileUrl).then((r) => r.arrayBuffer()),
      Math.min(2800, left),
      'download_timeout'
    );
    const buf = Buffer.from(bin);
    // Hard size guard for Hobby
    if (buf.length > 900 * 1024) {
      return {
        ok: false,
        error: 'Image still large after size pick (>900KB). Crop tighter and retry.',
      };
    }
    const mime = path.endsWith('.png')
      ? 'image/png'
      : path.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const b64 = buf.toString('base64');
    const left2 = budget - (Date.now() - t0);
    return geminiVision({
      mime,
      base64: b64,
      userText: (caption || 'Scan').slice(0, 120),
      deadlineMs: left2,
    });
  } catch (e) {
    const msg = e.message || String(e);
    if (/timeout/i.test(msg)) {
      return {
        ok: false,
        error:
          'Image scan took too long (Vercel Hobby limit). Send a smaller/cropped screenshot.',
      };
    }
    return { ok: false, error: msg };
  }
}

export function formatScanResult(r) {
  if (!r.ok) {
    return (
      '👁 *Vision · ' +
      VERSION +
      '*\n❌ ' +
      String(r.error || 'failed').slice(0, 400) +
      '\n\n_Crop UI region · bright text · retry once._'
    );
  }
  return (
    '👁 *Vision Scan · ' +
    VERSION +
    '*\n_' +
    (r.provider || 'gemini') +
    (r.ms ? ' · ' + r.ms + 'ms' : '') +
    '_\n\n' +
    String(r.text || '').slice(0, 3200)
  );
}

export default {
  VERSION,
  visionHelp,
  pickTelegramPhoto,
  scanFromTelegramFile,
  formatScanResult,
};
