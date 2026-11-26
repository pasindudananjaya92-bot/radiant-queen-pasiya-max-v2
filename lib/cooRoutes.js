import * as coo from './cooEngine.js';

export async function tryCooHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(coo)(\s|$)/i.test(raw.toLowerCase())) return null;
  const rest = raw.toLowerCase() === 'coo' ? '' : raw.replace(/^coo\s*/i, '').trim();
  const cmd = (rest.split(/\s+/)[0] || '').toLowerCase();
  if (!rest || cmd === 'board' || cmd === 'today' || cmd === 'status' || cmd === 'pulse') {
    const r = await coo.buildBoard();
    return r.text;
  }
  if (cmd === 'help' || cmd === '?') return coo.helpText();
  return coo.helpText();
}

export async function tryHandle(text, ctx) {
  return tryCooHandle(text);
}

export default { tryHandle, tryCooHandle };
