import * as bus from './publishBus.js';

export async function tryPublishHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  if (!/^(publish|pub)\b/i.test(lower)) return null;

  let rest = raw.replace(/^(publish|pub)\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || 'help').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return bus.helpText();

  if (cmd === 'pack' || cmd === 'today' || cmd === 'run') {
    const topic = parts[1] || head.replace(/^(pack|today|run)\s*/i, '').trim();
    const bundle = await bus.buildPublishPack(topic || '');
    return bus.formatPack(bundle);
  }

  return bus.helpText();
}

export async function tryHandle(text, ctx) {
  return tryPublishHandle(text);
}

export default { tryHandle, tryPublishHandle };
