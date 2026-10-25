/**
 * v4000 C2+C3+C4 router
 */
import { handleAskCommand } from './vaneAnswer.js';
import { handleDebug } from './debugLite.js';
import { handleDocCommand } from './docRag.js';
import { handleResearchCommand } from './searchJobs.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export async function handleV4000({ text, ctx, bot }) {
  const t = String(text || '').trim();
  if (!t) return false;

  if (
    /^\/(askweb|vane|webask|askreddit|askscholar|askacademic|askyt|askyoutube|asknews)(?:@\w+)?(?:\s|$)/i.test(
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
      await ctx.reply('❌ search error: ' + (e.message || e));
    }
    return true;
  }

  if (/^\/doc(list|ask|del|add)?(?:@\w+)?(?:\s|$)/i.test(t)) {
    try {
      const msg = await handleDocCommand({ text: t, ctx, bot });
      if (msg) await ctx.reply(String(msg).slice(0, 4000));
    } catch (e) {
      await ctx.reply('❌ /doc error: ' + (e.message || e));
    }
    return true;
  }

  if (/^\/research(deep|status|list)?(?:@\w+)?(?:\s|$)/i.test(t)) {
    try {
      const msg = await handleResearchCommand({ text: t, ctx, bot });
      if (msg) await ctx.reply(String(msg).slice(0, 4000), {
        disable_web_page_preview: true,
      });
    } catch (e) {
      await ctx.reply('❌ research error: ' + (e.message || e));
    }
    return true;
  }

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
