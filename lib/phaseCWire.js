/**
 * Drop-in: call from founderCmds middleware AFTER cmd is parsed.
 *
 * Example inside bot.use founder block:
 *   if (cmd === '/patchlog' || cmd === '/healcheck' || cmd === '/doctor') {
 *     const { handlePhaseCRoute } = await import('../lib/v5000CRoutes.js');
 *     const out = await handlePhaseCRoute({ cmd, text, ctx, supabase, bot });
 *     if (out) { await ctx.reply(out); return; }
 *   }
 *
 * Also add to founderCmds Set: '/patchlog', '/healcheck', '/doctor'
 */
export const PHASE_C_FOUNDER_CMDS = ['/patchlog', '/healcheck', '/doctor'];

export async function tryPhaseCCommand({ cmd, text, ctx, supabase, bot }) {
  const c = String(cmd || '').toLowerCase();
  if (!PHASE_C_FOUNDER_CMDS.includes(c)) return null;
  const { handlePhaseCRoute } = await import('./v5000CRoutes.js');
  return handlePhaseCRoute({ cmd: c, text, ctx, supabase, bot });
}

export default { PHASE_C_FOUNDER_CMDS, tryPhaseCCommand };
