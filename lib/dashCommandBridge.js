
import { tryHardCommand } from './commandHardGate.js';

export async function handleDashChatPayload(query = {}, body = {}) {
  const text = String(
    query.text || query.msg || body.text || body.message || body.prompt || ''
  ).trim();
  if (!text) return { ok: false, error: 'empty message' };

  const hard = await tryHardCommand(text);
  if (hard != null) {
    return { ok: true, mode: 'command', reply: hard, text: hard, content: hard };
  }

  try {
    const dc = await import('./dashboardChat.js');
    const fn =
      dc.handleDashboardChat ||
      dc.processDashboardMessage ||
      dc.dashboardChat ||
      dc.default;
    if (typeof fn === 'function') {
      const out = await fn({ text, message: text, prompt: text });
      if (out == null) return { ok: true, mode: 'chat', reply: '' };
      if (typeof out === 'string') return { ok: true, mode: 'chat', reply: out, text: out };
      return { ok: true, mode: 'chat', ...out, reply: out.reply || out.text || out.content };
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  return { ok: false, error: 'dashboardChat unavailable' };
}
