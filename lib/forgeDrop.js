/**
 * lib/forgeDrop.js — send large text as Telegram document (no temp disk)
 */
import { formatCodeBlock, codeReplyOpts } from './formatCode.js';

const TELEGRAM_TEXT_SAFE = 3500;

export function shouldDropAsFile(text, threshold = 4000) {
  return Buffer.byteLength(String(text || ''), 'utf8') > threshold;
}

/**
 * Reply with code block if small; else sendDocument from Buffer
 */
export async function replyCodeOrFile(ctx, {
  text,
  filename = 'output.txt',
  lang = '',
  caption = '',
  threshold = 4000,
} = {}) {
  const body = String(text || '');
  if (!shouldDropAsFile(body, threshold)) {
    if (lang) {
      await ctx.reply(formatCodeBlock(body, lang), codeReplyOpts());
    } else {
      await ctx.reply(body.slice(0, TELEGRAM_TEXT_SAFE));
    }
    return { ok: true, mode: 'text' };
  }

  const buf = Buffer.from(body, 'utf8');
  await ctx.replyWithDocument(
    { source: buf, filename: filename || 'forge-drop.txt' },
    {
      caption: (caption || '📎 Forge Drop · ' + buf.length + ' bytes').slice(0, 200),
    }
  );
  return { ok: true, mode: 'file', bytes: buf.length };
}

export async function sendBufferDocument(ctx, buffer, filename, caption) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
  await ctx.replyWithDocument(
    { source: buf, filename: filename || 'file.txt' },
    { caption: (caption || '').slice(0, 200) }
  );
  return { ok: true, bytes: buf.length };
}

export default { shouldDropAsFile, replyCodeOrFile, sendBufferDocument };
