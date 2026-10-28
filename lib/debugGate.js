'use strict';
async function tryDebugGate(ctx) {
  const text = String(ctx?.message?.text || '').trim();
  if (!/^\/debug\b/i.test(text)) return false;
  try {
    const { handlePhaseADebug } = require('./phaseADebug');
    const msg = await handlePhaseADebug({ text, ctx });
    if (msg && ctx.reply) await ctx.reply(String(msg).slice(0, 4000));
    return true;
  } catch (e) {
    try { if (ctx.reply) await ctx.reply('debugGate: ' + (e.message || e)); } catch (_) {}
    return true;
  }
}
function isDebugCommand(text) {
  return /^\/debug\b/i.test(String(text || '').trim());
}
module.exports = { tryDebugGate, isDebugCommand };
