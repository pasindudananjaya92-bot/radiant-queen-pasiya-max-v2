// Phase 7 — Platform Telegram commands
// drive list|get|delete|upload · mail test · email · tts · bank list · chat history · morning pack

import * as drive from './driveManager.js';
import * as mail from './mailManager.js';
import * as bank from './bankManager.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

function deny(ctx) {
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
  return null;
}

async function downloadTelegramFile(ctx, fileId) {
  const tg = ctx.telegram || ctx.tg;
  if (!tg) throw new Error('No Telegram API context');
  const link = await tg.getFileLink(fileId);
  const url = link.href || link;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  // ---- help ----
  if (/^(platform|drive|mail)\s+help$/i.test(lower) || /^p7\s+help$/i.test(lower)) {
    return (
      '*Phase 7 · Platform*\n' +
      '• `drive list`\n' +
      '• `drive get <name>`\n' +
      '• `drive delete <name>`\n' +
      '• Reply to a file with `drive upload` or `drive upload name.ext`\n' +
      '• `mail test`\n' +
      '• `email <to> | <subject> | <body>`\n' +
      '• `tts <text>`\n' +
      '• `bank list`\n' +
      '• `chat history`\n' +
      '• `chat clear`\n' +
      '• `morning pack` / `morning now`'
    );
  }

  // ---- morning pack ----
  if (/^morning\s+(pack|now|report)$/i.test(lower) || /^morningpack$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const mp = await import('./morningPack.js');
      const r = await mp.runMergedMorning({ sendTelegram: true, voice: true });
      return `✅ Morning Pack delivered\ntext=${!!r.send?.ok} · voice=${r.voice?.ok ? 'ok' : r.voice?.error || 'skip'}`;
    } catch (e) {
      return `❌ Morning Pack: ${e.message || e}`;
    }
  }

  // ---- drive list ----
  if (/^drive(\s+list|\s+ls)?$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const r = await drive.listDrive(30);
      if (!r.ok) return `❌ Drive: ${r.error}`;
      if (!r.files?.length) return `📁 Drive empty (\`${r.bucket || 'vault'}\`)`;
      const lines = r.files.slice(0, 25).map((f, i) => {
        const kb = f.size != null ? `${Math.round(Number(f.size) / 1024)}KB` : '?';
        return `${i + 1}. \`${f.path || f.name}\` (${kb})`;
      });
      return `📁 *Drive* · ${r.count} · \`${r.bucket}\`\n\n${lines.join('\n')}`;
    } catch (e) {
      return `❌ Drive: ${e.message || e}`;
    }
  }

  // ---- drive get ----
  const getM = raw.match(/^drive\s+get\s+(.+)$/i);
  if (getM) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const path = getM[1].trim().replace(/^[`"]|[`"]$/g, '');
      const r = await drive.signFile(path);
      if (!r.url) return `❌ Not found: \`${path}\``;
      return `🔗 *${path}*\n${r.url}\n_(link ~1 hour)_`;
    } catch (e) {
      return `❌ Drive get: ${e.message || e}`;
    }
  }

  // ---- drive delete ----
  const delM = raw.match(/^drive\s+(delete|rm|remove)\s+(.+)$/i);
  if (delM) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const path = delM[2].trim().replace(/^[`"]|[`"]$/g, '');
      await drive.removeFile(path);
      return `🗑️ Deleted: \`${path}\``;
    } catch (e) {
      return `❌ Drive delete: ${e.message || e}`;
    }
  }

  // ---- drive upload (reply to document/photo) ----
  if (/^drive\s+upload\b/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const msg = ctx?.message || ctx?.update?.message;
      const replied = msg?.reply_to_message;
      const src = replied || msg;
      const doc = src?.document || (src?.photo ? src.photo[src.photo.length - 1] : null);
      if (!doc) {
        return '📎 Reply to a *document or photo* with:\n`drive upload`\nor `drive upload myname.ext`';
      }
      let filename = 'file';
      const nameMatch = raw.match(/^drive\s+upload\s+(.+)$/i);
      if (nameMatch) filename = nameMatch[1].trim().replace(/[\/\\]/g, '_').slice(0, 120);
      else if (src.document?.file_name) filename = src.document.file_name.replace(/[\/\\]/g, '_').slice(0, 120);
      else if (src.photo) filename = `photo_${Date.now()}.jpg`;

      const buf = await downloadTelegramFile(ctx, doc.file_id);
      const vault = await import('./vaultManager.js');
      const ctype =
        src.document?.mime_type ||
        (src.photo ? 'image/jpeg' : 'application/octet-stream');
      await vault.uploadBuffer(filename, buf, ctype);
      return `✅ Uploaded to Drive/Vault:\n\`${filename}\`\nSize: ${Math.round(buf.length / 1024)} KB`;
    } catch (e) {
      return `❌ Drive upload: ${e.message || e}`;
    }
  }

  // ---- mail test ----
  if (/^mail\s+test$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const r = await mail.sendEmail({
        subject: 'Queen OS — Mail Test',
        text: 'Test from Telegram · ' + new Date().toISOString(),
      });
      if (!r.ok) return `❌ Mail: ${r.error}`;
      return `✅ Test email → ${r.to}\nId: ${r.id || '—'}`;
    } catch (e) {
      return `❌ Mail: ${e.message || e}`;
    }
  }

  // ---- email to | subject | body ----
  if (/^email\s+/i.test(lower) || /^mail\s+send\s+/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    const payload = raw.replace(/^(email|mail\s+send)\s+/i, '');
    const parts = payload.split('|').map((s) => s.trim());
    if (parts.length < 3) {
      return 'Usage:\n`email user@x.com | Subject here | Body text`';
    }
    const [to, subject, ...rest] = parts;
    const body = rest.join('|');
    try {
      const r = await mail.sendEmail({ to, subject, text: body });
      if (!r.ok) return `❌ Email: ${r.error}`;
      return `✅ Email sent → ${r.to}\nSubject: ${subject}`;
    } catch (e) {
      return `❌ Email: ${e.message || e}`;
    }
  }

  // ---- tts ----
  const ttsMatch = raw.match(/^tts\s+(.+)$/is);
  if (ttsMatch) {
    const d = deny(ctx);
    if (d) return d;
    const phrase = ttsMatch[1].trim().slice(0, 500);
    try {
      const voice = await import('./voiceDash.js');
      const r = await voice.speakForDashboard(phrase);
      if (ctx && (ctx.telegram || ctx.tg)) {
        const tg = ctx.telegram || ctx.tg;
        const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
        if (r.url) {
          try {
            await tg.sendVoice(chatId, r.url, { caption: phrase.slice(0, 100) });
            return null;
          } catch (_) {
            await tg.sendMessage(chatId, `🔊 ${r.url}`);
            return null;
          }
        }
        const tts = await import('./ttsManager.js');
        const speak = tts.speakText || tts.speakBriefing;
        if (typeof speak === 'function') {
          const audio = await speak(phrase, 'female');
          if (audio.ok && audio.buffer) {
            const buf = Buffer.isBuffer(audio.buffer) ? audio.buffer : Buffer.from(audio.buffer);
            await tg.sendVoice(chatId, { source: buf }, { caption: phrase.slice(0, 100) });
            return null;
          }
        }
      }
      if (!r.ok) return `❌ TTS: ${r.error}`;
      return r.url ? `🔊 ${r.url}` : `🔊 TTS ok`;
    } catch (e) {
      return `❌ TTS: ${e.message || e}`;
    }
  }

  // ---- bank list ----
  if (/^bank(\s+list)?$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const txs = await bank.listTransactions(5);
      const sum = await bank.summary(30);
      if (!txs.length) return `🏦 Empty · 30d Rs.${sum.total || 0}`;
      const lines = txs.map(
        (t, i) =>
          `${i + 1}. Rs.${t.amount} · ${t.merchant || t.note || '—'} · ${t.category}`
      );
      return `🏦 *Bank* · 30d Rs.${sum.total || 0}\n\n${lines.join('\n')}`;
    } catch (e) {
      return `❌ Bank: ${e.message || e}`;
    }
  }

  // ---- chat history ----
  if (/^chat\s+history$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const cp = await import('./chatPro.js');
      const h = await cp.history(12);
      const msgs = h.messages || [];
      if (!msgs.length) return '💬 Chat history empty.';
      const lines = msgs.map((m) => {
        const role = m.role === 'user' ? 'You' : 'Queen';
        return `*${role}:* ${String(m.content || '').slice(0, 180)}`;
      });
      return `💬 *Chat history* (last ${msgs.length})\n\n${lines.join('\n\n')}`.slice(0, 3900);
    } catch (e) {
      return `❌ Chat history: ${e.message || e}`;
    }
  }

  // ---- chat clear ----
  if (/^chat\s+clear$/i.test(lower)) {
    const d = deny(ctx);
    if (d) return d;
    try {
      const cp = await import('./chatPro.js');
      await cp.clearHistory();
      return '🧹 Dashboard chat history cleared.';
    } catch (e) {
      return `❌ Chat clear: ${e.message || e}`;
    }
  }

  return null;
}

export default { tryHandle };
