import * as gate from './deployGate.js';

export async function tryDeployGateHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();

  if (!/^(dgate)\b/i.test(lower) && !/^deploy\s+(gate|advice|gatekeeper)\b/i.test(lower)) {
    return null;
  }

  if (/^deploy\s+advice\b/i.test(lower) || /^dgate\s+advice\b/i.test(lower)) {
    const tips = await gate.advice();
    return ['🚧 *Deploy advice · 37-S3.1*', ...tips.map((t) => '· ' + t)].join('\n');
  }

  if (
    /^dgate(\s+help)?$/i.test(lower) ||
    /^deploy\s+gate(\s+help)?$/i.test(lower) ||
    /^deploy\s+gatekeeper\b/i.test(lower)
  ) {
    if (/help/i.test(lower)) return gate.helpText();
    return gate.formatStatus();
  }

  return gate.formatStatus();
}

export async function tryHandle(text, ctx) {
  return tryDeployGateHandle(text);
}

export default { tryHandle, tryDeployGateHandle };
