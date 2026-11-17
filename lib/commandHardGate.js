/**
 * Shared hard-gate: Dashboard Chat + any surface must match Telegram command routing.
 * Returns reply string or null (fall through to LLM chat).
 */
export async function tryHardCommand(text, ctx = { from: { id: process.env.ADMIN_ID || process.env.FOUNDER_ID } }) {
  const rt = String(text || '').trim().replace(/^\//, '');
  if (!rt) return null;

  const tryRoute = async (modPath) => {
    try {
      const mod = await import(modPath);
      if (typeof mod.tryHandle === 'function') {
        const out = await mod.tryHandle(rt, ctx);
        if (out != null && out !== '') return String(out);
      }
    } catch (e) {
      return '❌ ' + (e.message || e);
    }
    return null;
  };

  if (/^(site|webmaster)\b/i.test(rt)) return tryRoute('./webMasterRoutes.js');
  if (/^(deploy|guardian)\b/i.test(rt)) return tryRoute('./deployRoutes.js');
  if (
    /^(god|twin|empire|deal|inbox|gswarm|unit|web|preset)\b/i.test(rt) ||
    /^(swarm\s+spawn|swarm\s+units)\b/i.test(rt)
  ) {
    return tryRoute('./godRoutes.js');
  }
  if (/^(lab|laboratory|researchnet)\b/i.test(rt)) return tryRoute('./labRoutes.js');
  if (/^(qa|legion)\b/i.test(rt)) return tryRoute('./qaRoutes.js');
  if (/^(omni|omnimind)\b/i.test(rt)) return tryRoute('./omniRoutes.js');
  if (/^(coverage|stations)\b/i.test(rt)) return tryRoute('./coverageRoutes.js');
  if (/^(heal|immune|playbook)\b/i.test(rt)) return tryRoute('./healerRoutes.js');
  if (/^(sentinel|audit)\b/i.test(rt)) return tryRoute('./sentinelRoutes.js');
  if (/^(codeswarm|codeheal)\b/i.test(rt)) return tryRoute('./codeSwarmRoutes.js');
  if (/^(swarm|nation|corps|mission)\b/i.test(rt)) return tryRoute('./missionRoutes.js');
  if (/^(think)\b/i.test(rt)) return tryRoute('./thinkRoutes.js');

  // Generic agent families via agentExecute
  if (
    /^(health|vault|mem|make|snap|cron|morning|night|shadow|drive|bank|mail|email|tts|doc|voice|pipeline|scout)\b/i.test(
      rt
    )
  ) {
    try {
      const ae = await import('./agentExecute.js');
      if (typeof ae.tryAgentExecute === 'function') {
        const out = await ae.tryAgentExecute(rt, ctx);
        if (out != null && out !== '') return String(out);
      }
    } catch (_) {}
  }
  return null;
}

export default { tryHardCommand };
