/**
 * COO routes · Wave 37-S3
 */
'use strict';

const coo = require('./cooEngine');

function tryCooHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  if (!/^(coo)(\s|$)/i.test(lower)) return null;

  const rest = lower === 'coo' ? '' : raw.replace(/^coo\s*/i, '').trim();
  const cmd = (rest.split(/\s+/)[0] || 'board').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') {
    return Promise.resolve(coo.helpText());
  }
  if (cmd === 'board' || cmd === 'today' || cmd === 'status' || cmd === 'pulse') {
    return coo.buildBoard().then((r) => r.text);
  }
  return Promise.resolve(coo.helpText());
}

async function tryHandle(text, ctx) {
  return tryCooHandle(text);
}

module.exports = { tryCooHandle, tryHandle };
