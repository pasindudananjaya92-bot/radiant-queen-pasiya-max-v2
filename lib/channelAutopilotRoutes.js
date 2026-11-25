import * as ch from './channelAutopilot.js';

export async function tryChannelAutoHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  // Do not steal existing `channel post` / receptionist channel commands if richer handler exists
  if (!/^(channel)\b/i.test(lower)) return null;

  const rest = raw.replace(/^channel\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = parts[0] || '';
  const cmd = (head.split(/\s+/)[0] || '').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return ch.helpText();

  // Leave `channel post` / `channel list` to receptionist if present — only handle draft/pack/auto
  if (cmd === 'post' || cmd === 'list' || cmd === 'get') return null;

  if (cmd === 'draft' || cmd === 'pack' || cmd === 'auto') {
    const body = parts[1] || head.replace(/^(draft|pack|auto)\s*/i, '').trim();
    if (!body) return 'Usage: `channel draft <text>`';
    const r = await ch.draftChannelPost(body);
    return ch.formatDraft(r);
  }

  // bare channel → help
  return ch.helpText();
}

export async function tryHandle(text, ctx) {
  return tryChannelAutoHandle(text);
}

export default { tryHandle, tryChannelAutoHandle };
