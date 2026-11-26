import * as st from './stationEngine.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(station|hq|controlroom)\b/i.test(raw)) return null;

  const rest = raw.replace(/^(station|hq|controlroom)\s*/i, '').trim();
  const cmd = (rest.split(/\s+/)[0] || '').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return st.helpText();
  if (cmd === 'home' || cmd === 'about') return st.homeText();

  if (cmd === 'status' || cmd === 'board') {
    const snap = await st.collectSnapshot();
    return st.formatStatus(snap);
  }
  if (cmd === 'pulse' || cmd === 'ok') {
    const snap = await st.collectSnapshot();
    return st.formatPulse(snap);
  }
  if (cmd === 'brief' || cmd === 'ai') {
    return await st.buildBriefForAI();
  }

  return st.helpText();
}

export default { tryHandle };
