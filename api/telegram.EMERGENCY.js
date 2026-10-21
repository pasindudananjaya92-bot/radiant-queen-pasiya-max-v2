/**
 * EMERGENCY telegram.js — replace api/telegram.js with this file content
 * ONLY /ping /start until full restore
 */
import { Telegraf } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        mode: 'EMERGENCY',
        hasToken: Boolean(BOT_TOKEN),
      });
    }
    if (!BOT_TOKEN) {
      return res.status(200).json({ ok: false, error: 'no token' });
    }
    const bot = new Telegraf(BOT_TOKEN);
    bot.command('ping', async (ctx) => {
      await ctx.reply('pong ✅ EMERGENCY mode — restore full telegram.js next');
    });
    bot.command('start', async (ctx) => {
      await ctx.reply('EMERGENCY bot alive. Founder: upload full api/telegram.js');
    });
    bot.on('message', async (ctx) => {
      const t = String(ctx.message?.text || '');
      if (t.startsWith('/')) {
        await ctx.reply('EMERGENCY mode. Only /ping /start work. Restore full telegram.js');
      }
    });
    await bot.handleUpdate(req.body || {});
    return res.status(200).json({ ok: true, mode: 'EMERGENCY' });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
