/**
 * Wave 29A — Vision Scan (screenshots, emails, UI)
 * Uses free Gemini multimodal via existing GEMINI_API_KEY (generateContent).
 * Fallback: Groq vision if configured; else clear error.
 * Founder-facing structured report — Sinhala+English mix OK in prompt.
 */
export const VERSION = '29A';

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
const GEMINI_MODELS = (
  process.env.VISION_GEMINI_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash,gemini-flash-latest'
)
  .split(',')
  .map((s) => s.trim().replace(/^models\//, ''))
  .filter(Boolean);

export function visionHelp() {
  return [
    '👁 *Vision Scan · ' + VERSION + '*',
    'Screenshot / email / UI — full structured read',
    '',
    '• Send a *photo* with caption: `scan` or `explain` or `කියවන්න`',
    '• Or: `scan` as caption on any image',
    '• `vision help` — this menu',
    '',
    'Output: title, all readable text, UI elements, numbers, links, action items, risks.',
    '_Uses free Gemini multimodal · no paid Cloud billing._',
  ].join('\n');
}

function systemPrompt() {
  return (
    'You are Queen OS Vision — a precise mobile-first analyst for the Founder (Sri Lanka). ' +
    'Language: clear Sinhala + English mix when helpful, else English. ' +
    'When given a screenshot or document image, you MUST:\n' +
    '1) State what the image IS (email, dashboard, error log, chat, invoice, etc.)\n' +
    '2) Extract ALL readable text (OCR) — preserve structure, headings, buttons, numbers\n' +
    '3) List UI elements / sections visible\n' +
    '4) Call out money, limits, errors, API names, dates, URLs\n' +
    '5) Give 3-6 bullet ACTION items relevant to a Telegram+Vercel+Supabase bot founder\n' +
    '6) Note FREE vs PAID signals if any marketing/pricing text appears\n' +
    '7) End with one-line verdict: USEFUL FOR QUEEN OS / SKIP / NEEDS FOUNDER\n' +
    'Never invent text that is not in the image. If blurry, say what is unclear.'
  );
}

async function geminiVision({ mime, base64, userText }) {
  const key = GEMINI_KEY();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY missing' };
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt() + '\n\nUser request:\n' + (userText || 'Full scan.') },
          { inline_data: { mime_type: mime || 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastErr = (j.error && j.error.message) || r.statusText || String(r.status);
        if (/not found|404|not supported/i.test(lastErr)) continue;
        if (/429|resource|quota/i.test(lastErr)) return { ok: false, error: 'quota: ' + lastErr };
        continue;
      }
      const text =
        j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || '';
      if (text) return { ok: true, text, provider: 'gemini:' + model };
      lastErr = 'empty response';
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }
  return { ok: false, error: lastErr || 'all vision models failed' };
}

export async function scanImageBuffer({ buffer, mime, caption }) {
  const b64 = Buffer.from(buffer).toString('base64');
  const userText =
    (caption && String(caption).trim()) ||
    'Full structured scan of this screenshot. Extract every useful detail.';
  return geminiVision({ mime: mime || 'image/jpeg', base64: b64, userText });
}

export async function scanFromTelegramFile({ botToken, fileId, caption }) {
  const meta = await fetch(
    'https://api.telegram.org/bot' + botToken + '/getFile?file_id=' + encodeURIComponent(fileId)
  ).then((r) => r.json());
  if (!meta.ok || !meta.result?.file_path) {
    return { ok: false, error: 'Telegram getFile failed' };
  }
  const path = meta.result.file_path;
  const bin = await fetch(
    'https://api.telegram.org/file/bot' + botToken + '/' + path
  ).then((r) => r.arrayBuffer());
  const mime = path.endsWith('.png')
    ? 'image/png'
    : path.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  return scanImageBuffer({ buffer: Buffer.from(bin), mime, caption });
}

export function formatScanResult(r) {
  if (!r.ok) {
    return (
      '👁 *Vision scan failed*\n' +
      String(r.error || 'unknown').slice(0, 300) +
      '\n_Check GEMINI_API_KEY free tier._'
    );
  }
  return (
    '👁 *Vision Scan · ' +
    VERSION +
    '*\n_' +
    (r.provider || 'gemini') +
    '_\n\n' +
    String(r.text || '').slice(0, 3800)
  );
}

export default {
  VERSION,
  visionHelp,
  scanImageBuffer,
  scanFromTelegramFile,
  formatScanResult,
};
