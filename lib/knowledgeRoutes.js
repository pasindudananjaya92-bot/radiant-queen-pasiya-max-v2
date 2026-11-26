import * as k from './knowledgeOs.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(know|knowledge)\b/i.test(raw)) return null;
  const rest = raw.replace(/^(know|knowledge)\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = parts[0] || '';
  const cmd = (head.split(/\s+/)[0] || '').toLowerCase();
  if (!rest || cmd === 'help' || cmd === '?') return k.helpText();
  if (cmd === 'search') return k.knowledgeSearch(parts[1] || head.replace(/^search\s*/i, '').trim());
  return k.knowledgeSearch(rest);
}

export default { tryHandle };
