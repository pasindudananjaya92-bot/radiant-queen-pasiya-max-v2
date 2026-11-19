import * as vision from './visionManager.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  if (!/^(vision|scan|explain|කියවන්න)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();
  if (/^(vision(\s+help)?|scan\s+help)$/i.test(lower)) return vision.visionHelp();

  // Caption/text path: if this update also carries a photo, run Vision immediately
  const photos = ctx?.message?.photo;
  if (Array.isArray(photos) && photos.length) {
    const best = vision.pickTelegramPhoto(photos);
    if (best?.file_id) {
      const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      const r = await vision.scanFromTelegramFile({
        botToken: token,
        fileId: best.file_id,
        caption: raw,
      });
      return vision.formatScanResult(r);
    }
  }

  if (/^(scan|explain|කියවන්න)\b/i.test(lower)) {
    return (
      '👁 No image attached.\n' +
      'Send a *photo* with caption: `scan` or `explain` or `කියවන්න`\n' +
      '(Text-only cannot OCR.)'
    );
  }
  return vision.visionHelp();
}

export default { tryHandle };
