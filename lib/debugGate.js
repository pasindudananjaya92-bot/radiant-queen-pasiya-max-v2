/**
 * debugGate.js — exclusive /debug router
 * Call this BEFORE any general AI / legacy /debug handlers.
 *
 * Usage in api/telegram.js (concept):
 *   const { tryDebugGate } = require('../lib/debugGate');
 *   // inside text handler, early:
 *   if (await tryDebugGate(ctx)) return;
 */

'use strict';

async function tryDebugGate(ctx) {
  const text = String(ctx?.message?.text || ctx?.update?.message?.text || '').trim();
  if (!/^\/debug\b/i.test(text)) return false;

  // Never route /debug to Hull B / general AI
  try {
    const { handleDebug } = require('./phaseADebug');
    const result = await handleDebug(ctx, text);
    if (result && result.handled) {
      const out = result.text || 'OK';
      if (ctx.reply) await ctx.reply(out.slice(0, 4000));
      return true;
    }
  } catch (e) {
    try {
      if (ctx.reply) await ctx.reply(`debugGate: ${e.message || e}`);
    } catch (_) {}
    return true; // still consume /debug so AI does not hallucinate
  }
  return false;
}

/** True if text is a /debug command (for routers) */
function isDebugCommand(text) {
  return /^\/debug\b/i.test(String(text || '').trim());
}

module.exports = { tryDebugGate, isDebugCommand };
