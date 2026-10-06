/**
 * Pack Factory V2 helpers — agent, inception, genome, evolve, bench, mirror, oracle, graph
 */

export function agentDebatePrompt(topic) {
  return (
    'Three experts debate. Topic: ' +
    String(topic).slice(0, 300) +
    '\nFormat exactly:\nRESEARCHER: ...\nWRITER: ...\nCRITIC: ...\nVERDICT: one best answer\nConcise.'
  );
}

export function agentChainPrompt(role, topic, prior) {
  return (
    'You are ' +
    role +
    '. Topic: ' +
    String(topic).slice(0, 300) +
    '\nPrior:\n' +
    String(prior || '').slice(0, 1500) +
    '\nDeliver your specialty output only.'
  );
}

export function inceptionPrompt(idea) {
  return (
    'Design a recursive bot-factory blueprint (2 levels max).\nIdea: ' +
    String(idea).slice(0, 400) +
    '\nOutput:\nL1 bot purpose\nL2 child bots (3)\nShared prompts\nSafety limits\nNo real BotFather calls — blueprint only.'
  );
}

export function genomeMutatePrompt(dna) {
  return (
    'Bot DNA mutation. Current DNA JSON/text:\n' +
    String(dna).slice(0, 2000) +
    '\nPropose MUTATED DNA with small improvements (features, tone, flows). Output DNA only.'
  );
}

export function evolveFromLogsPrompt(logs) {
  return (
    'Self-healing engineer. Build/runtime logs:\n' +
    String(logs).slice(0, 5000) +
    '\nList: root cause, minimal fix, files to touch, risk. Be concrete for Vercel+Telegram bot.'
  );
}

export function mirrorPrompt(botInfo) {
  return (
    'Reverse-engineer a Telegram bot from public info. Create a clone blueprint (commands, tone, features).\nInfo:\n' +
    String(botInfo).slice(0, 2000) +
    '\nOutput structured blueprint.'
  );
}

export function oraclePrompt(templatesText) {
  return (
    'Template trend oracle for a Telegram bot marketplace.\nData:\n' +
    String(templatesText).slice(0, 3000) +
    '\nPredict 3 templates likely to trend + why. Practical.'
  );
}

export function graphLinkPrompt(a, b, rel) {
  return (
    'Knowledge graph note. Connect A and B.\nA: ' +
    a +
    '\nB: ' +
    b +
    '\nRelation: ' +
    rel +
    '\nWrite 2 sentences for RAG memory + 3 keywords.'
  );
}

export default {
  agentDebatePrompt,
  agentChainPrompt,
  inceptionPrompt,
  genomeMutatePrompt,
  evolveFromLogsPrompt,
  mirrorPrompt,
  oraclePrompt,
  graphLinkPrompt,
};
