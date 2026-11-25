/**
 * Deploy Gate routes · Wave 37-S3
 */
'use strict';

const gate = require('./deployGate');

async function tryDeployGateHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();

  if (/^dgate\b/i.test(lower) || /^deploy\s+gate\b/i.test(lower)) {
    return gate.formatStatus();
  }
  if (/^deploy\s+advice\b/i.test(lower) || /^dgate\s+advice\b/i.test(lower)) {
    const tips = await gate.advice();
    return ['🚧 *Deploy advice*', ...tips.map((t) => `· ${t}`)].join('\n');
  }
  if (/^dgate\s+help\b/i.test(lower) || /^deploy\s+gate\s+help\b/i.test(lower)) {
    return gate.helpText();
  }
  if (/^dgate\b/i.test(lower)) return gate.formatStatus();
  return null;
}

async function tryHandle(text, ctx) {
  return tryDeployGateHandle(text);
}

module.exports = { tryHandle, tryDeployGateHandle };
