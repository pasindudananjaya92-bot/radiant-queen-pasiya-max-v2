import { handleHullOps } from './hullOps.js';
import { handleShadow } from './shadowTwin.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export function isPhaseECommand(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c === '/shadow' || c === '/hullops';
}

export async function handlePhaseERoute({ cmd, text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const c = String(cmd || '').toLowerCase();
  if (c === '/shadow') return handleShadow(text, ctx);
  if (c === '/hullops') return handleHullOps(text, ctx);
  // /hull ping|wake|get|retry|dna — intercept before phaseD create
  if (c === '/hull') {
    const [sub, ...restParts] = String(text || '')
      .replace(/^\/hull\s*/i, '')
      .trim()
      .split(/\s+/);
    if (['ping', 'b-ping', 'wake', 'get', 'retry', 'dna', 'ops'].includes(sub)) {
      return handleHullOps(text, ctx);
    }
  }
  return null;
}

export default { isPhaseECommand, handlePhaseERoute };