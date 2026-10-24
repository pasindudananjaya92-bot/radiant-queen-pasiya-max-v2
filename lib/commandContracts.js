export const CONTRACTS = {
  '/echo': {
    module: 'lib/echoX.js',
    expect: 'draft addresses payload; never How can I help',
    test: {
      text: '/echo draft Hello from twin',
      failIf: [/how can i help/i, /i'?m echo x/i],
      mustIncludeAny: ['twin', 'Hello', 'hello', 'patch', 'Ack', 'Next', 'signal'],
    },
  },
  '/expect': {
    module: 'lib/expectCmd.js',
    expect: 'list shows rules or empty-state help',
    test: {
      text: '/expect list',
      failIf: [/chronos-v logged/i],
      mustIncludeAny: ['EXPECT', 'rules', 'No custom', 'must include'],
    },
  },
  '/research': {
    module: 'lib/deepMindPro.js',
    expect: 'DeepMind job',
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
      mustIncludeAny: ['RADAR', 'POWERHOUSE'],
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
  if (!contract || !contract.test) {
    return { ok: text.length > 0, reason: text.length ? 'no-contract' : 'empty-reply' };
  }
  const t = contract.test;
  if (!text.trim()) return { ok: false, reason: 'silent-empty' };
  for (const re of t.failIf || []) {
    if (re.test(text)) return { ok: false, reason: 'failIf:' + re };
  }
  if (t.mustIncludeAny && t.mustIncludeAny.length) {
    const hit = t.mustIncludeAny.some(function (s) {
      return text.toLowerCase().includes(String(s).toLowerCase());
    });
    if (!hit && text.length < 40) return { ok: false, reason: 'missing-expected-markers' };
    if (!hit && cmd === '/echo' && text.length > 50) {
      return { ok: true, reason: 'substantial-non-banned' };
    }
    if (!hit) return { ok: false, reason: 'missing-expected-markers' };
  }
  return { ok: true, reason: 'pass' };
}

export default { CONTRACTS, getContract, evaluateOutput };
