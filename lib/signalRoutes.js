/**
 * Wave 36B · Signal routes (ESM tryHandle)
 * Prefix: signal | signals
 */
import * as sm from './signalManager.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || ctx?.fromId || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !/^(signal|signals)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const parts = raw.split(/\s+/);
  const cmd = (parts[1] || 'help').toLowerCase();

  try {
    if (cmd === 'help' || cmd === 'menu' || !parts[1]) return sm.helpText();

    if (cmd === 'status') {
      const st = await sm.status();
      return `📡 *Signal status · ${sm.VERSION}*\n${st.line}`;
    }

    if (cmd === 'list' || cmd === 'ls') {
      const res = await sm.listSignals({ limit: 15, unseenOnly: false });
      if (!res.ok) return `❌ Signal list: ${res.error}`;
      return sm.formatList(res.rows);
    }

    if (cmd === 'unseen' || cmd === 'new') {
      const res = await sm.listSignals({ limit: 15, unseenOnly: true });
      if (!res.ok) return `❌ Signal unseen: ${res.error}`;
      return sm.formatList(res.rows);
    }

    if (cmd === 'read' || cmd === 'ack' || cmd === 'seen') {
      const res = await sm.markSeen([]);
      if (!res.ok) return `❌ Signal read: ${res.error}`;
      return '✅ All signals marked seen';
    }

    if (cmd === 'test') {
      const res = await sm.emitSignal({
        kind: 'test',
        source: 'telegram',
        title: 'Signal desk test',
        body: 'Founder ran signal test from Telegram · Wave 36B',
        level: 'ok',
        meta: { who: String(ctx?.from?.id || 'founder') },
      });
      if (!res.ok) {
        return (
          `❌ Signal test failed: ${res.error}\n` +
          `Run SQL in Supabase: sql/001_wave36b_signals.sql`
        );
      }
      return `✅ Test signal written\n\`${String(res.id).slice(0, 8)}\`\nTry: \`signal list\``;
    }

    if (cmd === 'clear' || cmd === 'prune') {
      const res = await sm.clearOld({ days: 14 });
      if (!res.ok) return `❌ Signal clear: ${res.error}`;
      return `🧹 Cleared signals older than 14d · deleted ~${res.deleted ?? 0}`;
    }

    return sm.helpText();
  } catch (e) {
    return `❌ Signal error: ${e.message || String(e)}`;
  }
}

export const trySignalHandle = tryHandle;
