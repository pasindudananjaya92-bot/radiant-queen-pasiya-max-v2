/**
 * Hard-route helpers for v2000 commands (call from telegram middleware)
 */
import { powerRadar, formatRadar, powerChat, powerBrowse, powerScanText } from './powerhouse.js';
import { echoCommand } from './echoX.js';
import { researchStart, researchStatus } from './deepMindPro.js';
// chronos intent hook optional

const ADMIN = () => String(process.env.ADMIN_ID || '').trim();

export function isV2000Command(cmd) {
  return [
    '/power',
    '/radar',
    '/ph',
    '/echo',
    '/research',
    '/deepmind',
    '/scantext',
    '/browse',
  ].includes(cmd);
}

export async function handleV2000({ cmd, text, ctx, supabase, bot }) {
  const uid = String(ctx?.from?.id || '');
  const founder = uid && uid === ADMIN();

  if (cmd === '/radar' || cmd === '/power' || cmd === '/ph') {
    const sub = text.replace(/^\/(radar|power|ph)(@\w+)?\s*/i, '').trim();
    if (sub.startsWith('chat ') && founder) {
      const r = await powerChat(sub.slice(5));
      return r.ok
        ? '⚡ ' + r.engine + ' · ' + r.model + '\n\n' + r.text
        : '⚡ fail: ' + (r.error || '') + '\n' + (r.tried || []).join('\n');
    }
    if (sub.startsWith('browse ') && founder) {
      const r = await powerBrowse(sub.slice(7).trim());
      if (!r.ok) return 'Browse fail: ' + r.error;
      return ('🌐 ' + r.url + '\n\n' + r.markdown).slice(0, 4000);
    }
    const r = await powerRadar();
    return formatRadar(r);
  }

  if (cmd === '/echo') {
    const r = await echoCommand(ctx, supabase, text);
    return r.text;
  }

  if (cmd === '/research' || cmd === '/deepmind') {
    const rest = text.replace(/^\/(research|deepmind)(@\w+)?\s*/i, '').trim();
    if (rest.startsWith('status ')) {
      const r = await researchStatus(ctx, supabase, rest.slice(7).trim());
      return r.text;
    }
    const r = await researchStart(ctx, supabase, rest);
    if (r.document && bot) {
      try {
        await ctx.replyWithDocument({
          source: Buffer.from(r.document.content, 'utf8'),
          filename: r.document.filename,
        });
      } catch (_) {}
    }
    return r.text;
  }

  if (cmd === '/scantext' && founder) {
    const body = text.replace(/^\/scantext(@\w+)?\s*/i, '');
    const r = powerScanText(body);
    return r.clean
      ? '🛡 SCAN: clean'
      : '🛡 SCAN hits:\n' + r.hits.map((h) => h.label + ' ×' + h.count).join('\n');
  }

  if (cmd === '/browse' && founder) {
    const url = text.replace(/^\/browse(@\w+)?\s*/i, '').trim();
    const r = await powerBrowse(url);
    if (!r.ok) return 'Browse fail: ' + r.error;
    return ('🌐 ' + r.url + '\n\n' + r.markdown).slice(0, 4000);
  }

  return null;
}

export default { isV2000Command, handleV2000 };
