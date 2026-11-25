import * as cal from './contentCalendar.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(content)\b/i.test(raw)) return null;

  const rest = raw.replace(/^content\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || 'help').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return cal.helpText();

  if (cmd === 'today' || cmd === 'pack' || cmd === 'run') {
    const topic = parts[1] || head.replace(/^(today|pack|run)\s*/i, '').trim();
    const r = await cal.contentToday(topic || '');
    return r.text;
  }

  return cal.helpText();
}

export default { tryHandle };
