/**
 * Wave 29B — Vision Scan (Vercel Hobby ~10s safe)
 * - Prefer smaller Telegram photo sizes
 * - Hard deadline (default 7s) → clear error, never hang
 * - Faster Gemini models first · lower maxOutputTokens
 */
export const VERSION = '29B';

const HARD_MS = Math.min(
  9000,
  Math.max(4000, Number(process.env.VISION_TIMEOUT_MS || 7000) || 7000)
);

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
// Fast-first order for Hobby
const GEMINI_MODELS = (
  process.env.VISION_GEMINI_MODEL ||
  'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3.8-flash,gemini-2.5-flash,gemini-flash-latest'
)
  .split(',')
  .map((s) => s.trim().replace(/^models\//, ''))
  .filter(Boolean);

export function visionHelp() {
  return [
    '👁 *Vision Scan · ' + VERSION + '*',
    'Screenshot / email / UI — structured read (Hobby-safe)',
    '',
    '• Send a *photo* with caption: `scan` or `explain` or `කියවන්න`',
    '• `vision help` — this menu',
    '',
    'Timeout budget: ~' + Math.round(HARD_MS / 1000) + 's (Vercel Hobby).',
    'Large images may be downscaled. If slow → clear error (no hang).',
    '_Free Gemini multimodal · no paid Cloud billing._',
  ].join('\n');
}

function systemPrompt() {
  return (
    'You are Queen OS Vision. Be concise but complete (mobile Founder). ' +
    'Sinhala+English mix OK. For screenshots/emails:\n' +
    '1) What it is\n2) Key readable text (OCR, structured)\n' +
    '3) Numbers/errors/URLs\n4) 3 action bullets for Telegram+Vercel+Supabase bot\n' +
    '5) Verdict: USEFUL / SKIP / NEEDS FOUNDER\n' +
    'Do not invent text. Keep under ~450 words.'
  );
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label || 'timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function geminiVision({ mime, base64, userText, deadlineMs }) {
  const key = GEMINI_KEY();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY missing' };
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt() + '\n\nUser:\n' + (userText || 'Full scan.') },
          { inline_data: { mime_type: mime || 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 900,
    },
  };
  let lastErr = '';
  const t0 = Date.now();
  for (const model of GEMINI_MODELS) {
    const left = deadlineMs - (Date.now() - t0);
    if (left < 1200) {
      return { ok: false, error: 'timeout_budget · try smaller screenshot', partial: lastErr };
    }
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const r = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        Math.min(left, 5500),
        'model_timeout'
      );
      const j = await withTimeout(r.json(), 2000, 'json_timeout').catch(() => ({}));
      if (!r.ok) {
        lastErr = (j.error && j.error.message) || r.statusText || String(r.status);
        if (/429|resource|quota/i.test(lastErr))
          return { ok: false, error: 'quota: ' + lastErr.slice(0, 160) };
        continue;
      }
      const text =
        j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || '';
      if (text)
        return {
          ok: true,
          text,
          provider: 'gemini:' + model,
          ms: Date.now() - t0,
        };
      lastErr = 'empty';
    } catch (e) {
      lastErr = e.message || String(e);
      if (/timeout/i.test(lastErr)) {
        return {
          ok: false,
          error:
            'Image scan took too long (Vercel ~10s limit). Send a cropped/smaller screenshot or try again.',
        };
      }
    }
  }
  return { ok: false, error: lastErr || 'vision failed' };
}

/** Prefer mid-size Telegram photo to cut upload/vision time */
export function pickTelegramPhoto(photos) {
  const arr = photos || [];
  if (!arr.length) return null;
  // Prefer ~800-1280px width if present; else middle; else last
  const ranked = [...arr].sort((a, b) => (a.width || 0) - (b.width || 0));
  const mid = ranked.find((p) => (p.width || 0) >= 800 && (p.width || 0) <= 1280);
  if (mid) return mid;
  if (ranked.length >= 2) return ranked[Math.floor(ranked.length / 2)];
  return ranked[ranked.length - 1];
}

export async function scanFromTelegramFile({ botToken, fileId, caption }) {
  const t0 = Date.now();
  const budget = HARD_MS;
  try {
    const meta = await withTimeout(
      fetch(
        'https://api.telegram.org/bot' +
          botToken +
          '/getFile?file_id=' +
          encodeURIComponent(fileId)
      ).then((r) => r.json()),
      2500,
      'getFile_timeout'
    );
    if (!meta.ok || !meta.result?.file_path) {
      return { ok: false, error: 'Telegram getFile failed' };
    }
    const path = meta.result.file_path;
    const left = budget - (Date.now() - t0);
    const bin = await withTimeout(
      fetch('https://api.telegram.org/file/bot' + botToken + '/' + path).then((r) =>
        r.arrayBuffer()
      ),
      Math.min(3000, left),
      'download_timeout'
    );
    const buf = Buffer.from(bin);
    // Soft size guard — refuse huge buffers early
    if (buf.length > 2.5 * 1024 * 1024) {
      return {
        ok: false,
        error: 'Image too large (>2.5MB). Crop or send lower resolution.',
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
      userText: caption || 'Full structured scan. Be concise.',
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
      '\n\n_Tips: crop UI, use caption `scan`, retry once._'
    );
  }
  return (
    '👁 *Vision Scan · ' +
    VERSION +
    '*\n_' +
    (r.provider || 'gemini') +
    (r.ms ? ' · ' + r.ms + 'ms' : '') +
    '_\n\n' +
    String(r.text || '').slice(0, 3600)
  );
}

export default {
  VERSION,
  visionHelp,
  pickTelegramPhoto,
  scanFromTelegramFile,
  formatScanResult,
};
