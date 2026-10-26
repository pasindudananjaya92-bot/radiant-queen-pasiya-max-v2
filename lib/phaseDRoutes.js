import { handleHullCmd } from './hullControl.js';
import { handleErrorDnaCmd, recordErrorDna } from './errorDna.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export function isPhaseDCommand(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c === '/hull' || c === '/errordna' || c === '/dna';
}

export async function handlePhaseDRoute({ cmd, text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const c = String(cmd || '').toLowerCase();
  if (c === '/hull') return handleHullCmd(text, ctx);
  if (c === '/errordna' || c === '/dna') return handleErrorDnaCmd(text);
  return null;
}

/** Optional: call from bot.catch without auto-fix */
export async function softLogError({ message, command, filePath, stack }) {
  try {
    await recordErrorDna({ message, command, filePath, stack, status: 'open' });
  } catch (_) {}
}

export default { isPhaseDCommand, handlePhaseDRoute, softLogError };
