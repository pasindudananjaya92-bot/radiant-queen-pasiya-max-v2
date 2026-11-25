import * as coo from './cooEngine.js';

export async function tryCooHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  if (!/^(coo)(\s|$)/i.test(lower)) return null;

  const rest = lower === 'coo' ? '' : raw.replace(/^coo\s*/i, '').trim();
  const cmd = (rest.split(/\s+/)[0] || 'board').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return coo.helpText();
  if (cmd === 'board' || cmd === 'today' || cmd === 'status' || cmd === 'pulse') {
    const r = await coo.buildBoard();
    return r.text;
  }
  return coo.helpText();
}

export async function tryHandle(text, ctx) {
  return tryCooHandle(text);
}

export default { tryHandle, tryCooHandle };
