/**
 * Expected-result contracts — includes generic-help ban for /echo
 */
export const CONTRACTS = {
  '/echo': {
    module: 'lib/echoX.js',
    expect: 'draft must address payload; never How can I help / I\'m Echo X',
    test: {
      text: '/echo draft Hello from twin',
      failIf: [
        /how can i help/i,
        /i'?m echo x/i,
        /what can i (do|help)/i,
        /here to help you today/i,
      ],
      mustIncludeAny: ['twin', 'Hello', 'hello', 'patch', 'surgical', 'Ack', 'signal', 'payload', 'Next'],
    },
  },
  '/research': {
    module: 'lib/deepMindPro.js',
    expect: 'DeepMind Pro job DONE',
    test: {
      text: '/research multi-agent free tier 2026',
      failIf: [/^searching wikipedia/i],
      mustIncludeAny: ['DeepMind', 'job', 'DONE', 'Sources', 'research'],
    },
  },
  '/radar': {
    module: 'lib/powerhouse.js',
    expect: 'POWERHOUSE RADAR',
    test: {
      text: '/radar',
      mustIncludeAny: ['RADAR', 'POWERHOUSE', 'Keys'],
    },
  },
  '/architect': {
    module: 'lib/omniscientArchitect.js',
    expect: 'Architect help or status',
    test: {
      text: '/architect help',
      mustIncludeAny: ['ARCHITECT', 'retest', 'failed', 'status'],
    },
  },
};

export function getContract(cmd) {
  const c = String(cmd || '').toLowerCase().replace(/@\w+$/, '');
  return CONTRACTS[c] || null;
}

export function evaluateOutput(cmd, output) {
  const contract = getContract(cmd);
  const text = String(output || '');
  if (!contract?.test) {
    return { ok: text.length > 0, reason: text.length ? 'no-contract' : 'empty-reply' };
  }
  const t = contract.test;
  if (!text.trim()) return { ok: false, reason: 'silent-empty' };

  for (const re of t.failIf || []) {
    if (re.test(text)) return { ok: false, reason: 'failIf:' + re };
  }

  if (t.mustIncludeAny?.length) {
    const hit = t.mustIncludeAny.some((s) => text.toLowerCase().includes(String(s).toLowerCase()));
    if (!hit && text.length < 40) return { ok: false, reason: 'missing-expected-markers' };
    // long non-banned text OK for echo
    if (!hit && cmd === '/echo' && text.length > 50) {
      return { ok: true, reason: 'substantial-non-banned' };
    }
    if (!hit) return { ok: false, reason: 'missing-expected-markers' };
  }
  return { ok: true, reason: 'pass' };
}

export default { CONTRACTS, getContract, evaluateOutput };
