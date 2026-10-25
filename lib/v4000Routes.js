/**
 * v4000 + Phase C command router
 * Call from telegram.js early (after founder gate / before generic AI):
 *   import { handleV4000 } from '../lib/v4000Routes.js';
 *   const hit = await handleV4000({ text, ctx, bot });
 *   if (hit) return;
 */
import { handleAskCommand } from './vaneAnswer.js';
import { handleDebug } from './debugLite.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export async function handleV4000({ text, ctx }) {
  const t = String(text || '').trim();
  if (!t) return false;

  // /ask family — all users or founder-only? founder-only for API quota safety
  if (
    /^\/ask(reddit|scholar|academic|yt|youtube|web)?(?:@\w+)?(?:\s|$)/i.test(
      t
    )
  ) {
    if (String(ctx?.from?.id || '') !== ADMIN()) {
      await ctx.reply('👑 Founder-only while on free search tier.');
      return true;
    }
    try {
      const msg = await handleAskCommand(t);
      await ctx.reply(msg.slice(0, 4000), { disable_web_page_preview: true });
    } catch (e) {
      await ctx.reply('❌ /ask error: ' + (e.message || e));
    }
    return true;
  }

  // /debug family
  if (/^\/debug(?:@\w+)?(?:\s|$)/i.test(t)) {
    try {
      const msg = await handleDebug({ text: t, ctx });
      if (msg) await ctx.reply(String(msg).slice(0, 4000));
    } catch (e) {
      await ctx.reply('❌ /debug error: ' + (e.message || e));
    }
    return true;
  }

  return false;
}

export default { handleV4000 };
