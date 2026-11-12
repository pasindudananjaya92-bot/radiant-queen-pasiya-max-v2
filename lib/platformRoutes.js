// Telegram test commands for Platform features (Drive / Mail / TTS / Bank)
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

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  // drive list | drive
  if (/^drive(\s+list)?$/i.test(lower) || /^drive\s+ls$/i.test(lower)) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    try {
      const r = await drive.listDrive(30);
      if (!r.ok) return `❌ Drive error: ${r.error}`;
      if (!r.files?.length) return `📁 Drive empty (bucket: \`${r.bucket || 'vault'}\`)`;
      const lines = r.files.slice(0, 20).map((f, i) => {
        const kb = f.size != null ? `${Math.round(Number(f.size) / 1024)}KB` : '?';
        return `${i + 1}. \`${f.path || f.name}\` (${kb})`;
      });
      return `📁 *Drive* · ${r.count} file(s) · \`${r.bucket}\`\n\n${lines.join('\n')}`;
    } catch (e) {
      return `❌ Drive: ${e.message || e}`;
    }
  }

  // mail test
  if (/^mail\s+test$/i.test(lower)) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    try {
      const r = await mail.sendEmail({
        subject: 'Queen OS — Mail Test',
        text:
          'This is a test email from Radiant Queen OS.\n\nIf you received this, Resend + FOUNDER_EMAIL are working.\n\nTime: ' +
          new Date().toISOString(),
      });
      if (!r.ok) return `❌ Mail: ${r.error}`;
      return `✅ Test email sent to ${r.to}\nSubject: ${r.subject}\nId: ${r.id || '—'}`;
    } catch (e) {
      return `❌ Mail: ${e.message || e}`;
    }
  }

  // tts <text>
  const ttsMatch = raw.match(/^tts\s+(.+)$/is);
  if (ttsMatch) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    const phrase = ttsMatch[1].trim().slice(0, 500);
    if (!phrase) return 'Usage: `tts hello world`';
    try {
      const voice = await import('./voiceDash.js');
      const r = await voice.speakForDashboard(phrase);
      if (!r.ok) return `❌ TTS: ${r.error}`;

      // Prefer sending voice note to Telegram
      if (ctx && (ctx.telegram || ctx.tg) && r.url) {
        try {
          const tg = ctx.telegram || ctx.tg;
          const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
          await tg.sendMessage(chatId, `🔊 TTS ready (${r.provider || 'tts'})\n${r.url}`);
          // Try voice URL as audio
          try {
            await tg.sendAudio(chatId, r.url, { caption: phrase.slice(0, 100) });
          } catch (_) {
            try {
              await tg.sendVoice(chatId, r.url, { caption: phrase.slice(0, 100) });
            } catch (_) {}
          }
          return null; // already sent
        } catch (e) {
          return `🔊 TTS ok but Telegram send failed: ${e.message}\n${r.url || ''}`;
        }
      }

      // Fallback: buffer path via ttsManager directly to Telegram
      if (ctx && (ctx.telegram || ctx.tg)) {
        try {
          const tts = await import('./ttsManager.js');
          const speak = tts.speakText || tts.speakBriefing;
          if (typeof speak === 'function') {
            const audio = await speak(phrase, 'female');
            if (audio.ok && audio.buffer) {
              const tg = ctx.telegram || ctx.tg;
              const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
              const buf = Buffer.isBuffer(audio.buffer) ? audio.buffer : Buffer.from(audio.buffer);
              await tg.sendVoice(chatId, { source: buf }, { caption: phrase.slice(0, 100) });
              return null;
            }
          }
        } catch (_) {}
      }

      return r.url
        ? `🔊 TTS ready (${r.provider || 'tts'})\n${r.url}`
        : `🔊 TTS generated (${r.provider || 'tts'}) ${r.note || ''}`;
    } catch (e) {
      return `❌ TTS: ${e.message || e}`;
    }
  }

  // bank list
  if (/^bank(\s+list)?$/i.test(lower)) {
    if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
    try {
      const txs = await bank.listTransactions(3);
      const sum = await bank.summary(30);
      if (!txs.length) return `🏦 Bank empty\n30d total: Rs.${sum.total || 0}`;
      const lines = txs.map((t, i) => {
        return `${i + 1}. Rs.${t.amount} · ${t.merchant || t.note || '—'} · ${t.category} · ${String(t.tx_date).slice(0, 10)}`;
      });
      return `🏦 *Bank* · 30d Rs.${sum.total || 0}\n\n${lines.join('\n')}`;
    } catch (e) {
      return `❌ Bank: ${e.message || e}`;
    }
  }

  if (/^mail\s+help$/i.test(lower) || /^drive\s+help$/i.test(lower)) {
    return (
      '*Platform test commands*\n' +
      '• `drive list` — vault files\n' +
      '• `mail test` — send test email\n' +
      '• `tts <text>` — voice note\n' +
      '• `bank list` — last 3 transactions'
    );
  }

  return null;
}

export default { tryHandle };
