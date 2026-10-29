/**
 * v6000Routes.js — ensures /debug never falls through to AI
 * Wire: in telegram text handler, call tryV6000Routes(ctx) early.
 */
// v6000-seal-test

'use strict';

async function tryV6000Routes(ctx) {
  const text = String(ctx?.message?.text || '').trim();
  if (!text) return false;

  // 1) Exclusive debug gate (doctor/file/apply) — MUST be first
  if (/^\/debug\b/i.test(text)) {
    try {
      const { tryDebugGate } = require('./debugGate');
      if (await tryDebugGate(ctx)) return true;
    } catch (e) {
      try {
        await ctx.reply(`v6000 debug: ${e.message || e}`);
      } catch (_) {}
      return true;
    }
  }

  // 2) Surgeon / skill helpers if present
  if (/^\/surgeon\b/i.test(text) || /^\/skill\b/i.test(text)) {
    try {
      const skills = require('./hullSkills');
      if (typeof skills.handleSkillCommand === 'function') {
        const r = await skills.handleSkillCommand(ctx, text);
        if (r && r.handled) {
          if (r.text && ctx.reply) await ctx.reply(String(r.text).slice(0, 4000));
          return true;
        }
      }
    } catch (_) {
      /* optional */
    }
  }

  return false;
}

module.exports = { tryV6000Routes };
