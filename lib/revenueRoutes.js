import * as rev from './revenuePipeline.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(revenue|pipeline)\b/i.test(raw)) return null;
  const rest = raw.replace(/^(revenue|pipeline)\s*/i, '').trim().toLowerCase();
  const cmd = (rest.split(/\s+/)[0] || 'board').toLowerCase();
  if (!rest || cmd === 'board' || cmd === 'status' || cmd === 'today') return rev.pipelineBoard();
  if (cmd === 'help' || cmd === '?') return rev.helpText();
  return rev.helpText();
}

export default { tryHandle };
