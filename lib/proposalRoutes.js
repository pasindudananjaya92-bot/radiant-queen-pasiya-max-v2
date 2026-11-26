import * as prop from './proposalFactory.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(proposal|proposals)\b/i.test(raw)) return null;
  const rest = raw.replace(/^(proposal|proposals)\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || '').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return prop.helpText();

  if (cmd === 'pack' || parts.length >= 2) {
    let client, amount, scope;
    if (cmd === 'pack') {
      client = parts[1] || 'Client';
      amount = parts[2] || 'Talk';
      scope = parts[3] || 'Queen OS mobile setup';
    } else {
      client = parts[0] || 'Client';
      amount = parts[1] || 'Talk';
      scope = parts[2] || 'Queen OS mobile setup';
    }
    return prop.buildProposal({ client, amount, scope });
  }

  return prop.helpText();
}

export default { tryHandle };
