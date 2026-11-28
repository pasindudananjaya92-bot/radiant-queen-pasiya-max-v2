/**
 * Wave 43A — High-quality image generation (Founder private)
 * Gemini image models only. GODMODEAUTO OFF.
 * Daily limit: 10 (Supabase). Default aspect 1:1.
 */
export const VERSION = '43A';
export const DAILY_LIMIT = 10;

const QUALITY_SUFFIX =
  'highly detailed, photorealistic, sharp focus, professional lighting, ' +
  'high resolution, clean composition, natural colors, no text watermark, ' +
  '2K quality, masterpiece';

function adminId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
}

export function isFounderCtx(ctx) {
  const id = String(ctx && ctx.from ? ctx.from.id : '');
  const admin = adminId();
  return !!(admin && id && id === admin);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC day
}

async function sb() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (_) {
    return null;
  }
}

/** Returns { count, allowed, limit } */
export async function getDailyUsage(userId) {
  const uid = String(userId || 'founder');
  const day = todayKey();
  const client = await sb();
  if (!client) return { count: 0, allowed: true, limit: DAILY_LIMIT, persisted: false };

  try {
    const { data, error } = await client
      .from('queen_image_daily')
      .select('count')
      .eq('user_id', uid)
      .eq('day', day)
      .maybeSingle();
    if (error) return { count: 0, allowed: true, limit: DAILY_LIMIT, persisted: false };
    const count = data && data.count != null ? Number(data.count) : 0;
    return {
      count,
      allowed: count < DAILY_LIMIT,
      limit: DAILY_LIMIT,
      persisted: true,
    };
  } catch (_) {
    return { count: 0, allowed: true, limit: DAILY_LIMIT, persisted: false };
  }
}

export async function incrementDailyUsage(userId) {
  const uid = String(userId || 'founder');
  const day = todayKey();
  const client = await sb();
  if (!client) return false;
  try {
    const cur = await getDailyUsage(uid);
    const next = (cur.count || 0) + 1;
    const { error } = await client.from('queen_image_daily').upsert(
      {
        user_id: uid,
        day,
        count: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day' }
    );
    return !error;
  } catch (_) {
    return false;
  }
}

export function parseAspect(text) {
  const t = String(text || '');
  const m = t.match(/\b(1:1|16:9|9:16|4:3|3:4|3:2|2:3)\b/);
  return m ? m[1] : '1:1';
}

export function enhancePrompt(userPrompt, { editMode } = {}) {
  const base = String(userPrompt || '').trim();
  const aspect = parseAspect(base);
  let core = base
    .replace(/\b(1:1|16:9|9:16|4:3|3:4|3:2|2:3)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!core) core = 'a beautiful professional photograph';

  const faceLock = editMode
    ? 'Keep the same face identity 100%, do not change the person face, preserve facial features, '
    : '';

  return {
    enhanced:
      faceLock +
      core +
      ', ' +
      QUALITY_SUFFIX +
      ', aspect ratio ' +
      aspect,
    aspect,
    core,
  };
}

function modelList() {
  const primary =
    process.env.GEMINI_IMAGE_MODEL ||
    process.env.GEMINI_IMAGE_MODEL_PRIMARY ||
    'gemini-2.5-flash-image';
  const list = [
    primary,
    'gemini-3-pro-image-preview',
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.5-flash-image-preview',
  ];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Call Gemini image generation.
 * @returns {{ ok, buffer?, mime?, text?, error?, model? }}
 */
export async function generateImageGemini({ prompt, imageBase64, mimeType }) {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
  if (!key) return { ok: false, error: 'GEMINI_API_KEY missing in Vercel env' };

  const parts = [];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      // Image-capable Gemini models
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.4,
    },
  };

  let lastErr = 'no model worked';
  for (const model of modelList()) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = model + ': ' + String(data?.error?.message || res.status).slice(0, 180);
        continue;
      }

      const cand = data?.candidates?.[0]?.content?.parts || [];
      let buffer = null;
      let mime = 'image/png';
      let textOut = '';
      for (const p of cand) {
        if (p.text) textOut += p.text;
        const inline = p.inlineData || p.inline_data;
        if (inline && inline.data) {
          buffer = Buffer.from(inline.data, 'base64');
          mime = inline.mimeType || inline.mime_type || 'image/png';
        }
      }
      if (buffer && buffer.length > 100) {
        return { ok: true, buffer, mime, text: textOut, model };
      }
      lastErr = model + ': no image bytes in response';
    } catch (e) {
      lastErr = model + ': ' + String(e.message || e).slice(0, 150);
    }
  }
  return { ok: false, error: lastErr };
}

async function downloadTelegramFile(ctx, fileId) {
  const file = await ctx.telegram.getFile(fileId);
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!file?.file_path || !token) throw new Error('getFile failed');
  const url = 'https://api.telegram.org/file/bot' + token + '/' + file.file_path;
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed ' + res.status);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const ext = (file.file_path.split('.').pop() || 'jpg').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { base64: buf.toString('base64'), mime };
}

/**
 * Full command handler — sends photo via ctx.
 * Call from telegram.js: bot.command('image', ...) or tryHandle.
 */
export async function handleImageCommand(ctx, rawText) {
  if (!isFounderCtx(ctx)) {
    await ctx.reply('Private founder feature only.');
    return true;
  }

  const uid = String(ctx.from.id);
  const usage = await getDailyUsage(uid);
  if (!usage.allowed) {
    await ctx.reply(
      'අදට High-Quality Photo Limit එක ඉවරයි (' +
        usage.limit +
        '/' +
        usage.limit +
        '). හෙට උදේ ආයෙත් උත්සාහ කරන්න.'
    );
    return true;
  }

  let text = String(rawText || ctx.message?.text || ctx.message?.caption || '').trim();
  text = text.replace(/^\/image(@\w+)?\s*/i, '').trim();

  // Reply-to photo = edit mode
  let imageBase64 = null;
  let mimeType = null;
  let editMode = false;
  const reply = ctx.message && ctx.message.reply_to_message;
  if (reply && reply.photo && reply.photo.length) {
    editMode = true;
    const best = reply.photo[reply.photo.length - 1];
    try {
      const dl = await downloadTelegramFile(ctx, best.file_id);
      imageBase64 = dl.base64;
      mimeType = dl.mime;
    } catch (e) {
      await ctx.reply('Photo download failed: ' + (e.message || e));
      return true;
    }
  }

  if (!text && !editMode) {
    await ctx.reply(
      '🖼 *Image · ' +
        VERSION +
        '*\n' +
        'Usage:\n' +
        '• `/image <prompt>`\n' +
        '• Reply to a photo + `/image <edit instruction>`\n' +
        'Aspect: 1:1 (default) · 16:9 · 9:16 · 4:3\n' +
        'Daily HQ limit: ' +
        usage.count +
        '/' +
        usage.limit +
        '\n' +
        '_Gemini high quality · founder only_',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  if (!text && editMode) {
    text = 'Enhance this photo, keep the same face 100%, improve lighting and detail';
  }

  const { enhanced, aspect, core } = enhancePrompt(text, { editMode });
  await ctx.reply(
    '🖼 Generating HQ…\n' +
      (editMode ? 'Mode: edit (face lock)\n' : '') +
      'Aspect: ' +
      aspect +
      '\n' +
      'Prompt: ' +
      core.slice(0, 200) +
      '\n' +
      '_' +
      (usage.count + 1) +
      '/' +
      usage.limit +
      ' today_'
  );

  const result = await generateImageGemini({
    prompt: enhanced,
    imageBase64,
    mimeType,
  });

  if (!result.ok || !result.buffer) {
    await ctx.reply(
      'Image failed: ' +
        (result.error || 'unknown') +
        '\nCheck GEMINI_API_KEY + image model access in AI Studio.'
    );
    return true;
  }

  await incrementDailyUsage(uid);

  const caption = (
    'HQ · ' +
    (result.model || 'gemini') +
    ' · ' +
    aspect +
    (editMode ? ' · edit' : '') +
    '\n' +
    core.slice(0, 180)
  ).slice(0, 1000);

  try {
    await ctx.replyWithPhoto(
      { source: result.buffer },
      { caption }
    );
  } catch (e) {
    // fallback document if photo fails
    try {
      await ctx.replyWithDocument(
        {
          source: result.buffer,
          filename: 'queen-hq.png',
        },
        { caption: caption + '\n_(sent as file fallback)_' }
      );
    } catch (e2) {
      await ctx.reply('Send failed: ' + (e2.message || e2));
    }
  }
  return true;
}

/** agentExecute / text path without slash */
export function parseImageIntent(text) {
  const t = String(text || '').trim();
  if (/^\/image\b/i.test(t)) return { id: 'image_gen', args: { raw: t } };
  if (/^image\s+(.+)/i.test(t) || /^generate\s+image\s+(.+)/i.test(t)) {
    return { id: 'image_gen', args: { raw: t } };
  }
  return null;
}

export function helpText() {
  return [
    '🖼 Image HQ · ' + VERSION,
    '• /image <prompt> — Gemini high quality',
    '• Reply photo + /image <edit> — keep face',
    '• Aspect: 1:1 default · or 16:9 / 9:16 in prompt',
    '• Daily limit: ' + DAILY_LIMIT + ' (Supabase)',
    'Env: GEMINI_API_KEY · optional GEMINI_IMAGE_MODEL',
    '_Founder private · not Pollinations_',
  ].join('\n');
}
