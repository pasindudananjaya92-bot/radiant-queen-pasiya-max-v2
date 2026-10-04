/**
 * lib/brainAgent.js — /brain propose (self-evolving suggestions)
 */
export function brainProposePrompt(statsText) {
  return (
    'You are the self-evolution brain of Radiant Queen Telegram bot.\n' +
    'Based on usage signals, propose ONE concrete new feature or fix.\n' +
    'Format:\nTITLE: ...\nWHY: ...\nCOMMAND: /something\nPLAN: 3 short steps\nRISK: low|med\n' +
    'Signals:\n' +
    String(statsText || 'general growth').slice(0, 2000) +
    '\nBe practical, free-tier friendly, founder-approvable.'
  );
}

export function brainCodePrompt(proposal, fileHint) {
  return (
    'Write a minimal Node.js Telegraf handler sketch for this feature.\n' +
    'Proposal:\n' +
    String(proposal || '').slice(0, 1500) +
    '\nFile hint: ' +
    (fileHint || 'api/telegram.js') +
    '\nReturn only code in one block, no markdown fences if possible.'
  );
}

export default { brainProposePrompt, brainCodePrompt };
