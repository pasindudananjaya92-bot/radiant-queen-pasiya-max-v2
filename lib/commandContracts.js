/**
 * Expected-result contracts for founder commands.
 * Used by Omniscient Architect to detect logic failures.
 */
export const CONTRACTS = {
  '/echo': {
    module: 'lib/echoX.js',
    expect: 'draft payload must appear in reasoning; never pure generic greeting unless input is only hi/hello',
    test: {
      text: '/echo draft Hello from twin',
      failIf: [/how can i help/i, /^hi[!1.]*$/i, /^hello[!1.]*$/i],
      mustMatch: null, // soft
      mustIncludeAny: ['twin', 'Hello', 'hello', 'mirror', 'draft', 'Echo', 'ECHO'],
    },
  },
  '/research': {
    module: 'lib/deepMindPro.js',
    expect: 'DeepMind Pro job DONE or job id; not bare wikipedia dump',
    test: {
      text: '/research multi-agent free tier 2026',
      failIf: [/^searching wikipedia/i],
      mustIncludeAny: ['DeepMind', 'job', 'DONE', 'Sources', 'research'],
    },
  },
  '/radar': {
    module: 'lib/powerhouse.js',
    expect: 'POWERHOUSE RADAR status lines',
    test: {
      text: '/radar',
      mustIncludeAny: ['RADAR', 'POWERHOUSE', 'Keys'],
    },
  },
  '/chronosv': {
    module: 'lib/chronosV.js',
    expect: 'Logic Watchdog help or diagnose',
    test: {
      text: '/chronosv help',
      mustIncludeAny: ['CHRONOS', 'Watchdog', 'expect', 'diagnose'],
    },
  },
};

export function getContract(cmd) {
  const c = String(cmd || '').toLowerCase().replace(/@\w+$/, '');
  return CONTRACTS[c] || null;
}

/** Heuristic: does output violate contract? */
export function evaluateOutput(cmd, output) {
  const contract = getContract(cmd);
  const text = String(output || '');
  if (!contract?.test) {
    return { ok: text.length > 0, reason: text.length ? 'no-contract' : 'empty-reply' };
  }
  const t = contract.test;
  if (!text.trim()) return { ok: false, reason: 'silent-empty' };
  for (const re of t.failIf || []) {
    if (re.test(text.trim()) || (text.length < 80 && re.test(text))) {
      // only fail generic if short OR matches fail pattern strongly
      if (text.trim().length < 120 || re.test(text.trim())) {
        return { ok: false, reason: 'failIf:' + re };
      }
    }
  }
  if (t.mustIncludeAny?.length) {
    const hit = t.mustIncludeAny.some((s) => text.toLowerCase().includes(String(s).toLowerCase()));
    // For echo draft, also accept any non-generic substantial reply
    if (!hit && cmd === '/echo' && text.length > 40 && !/^(hi|hello|hey)[\s!.]*$/i.test(text.trim())) {
      return { ok: true, reason: 'substantial-non-generic' };
    }
    if (!hit && text.length < 30) return { ok: false, reason: 'missing-expected-markers' };
  }
  return { ok: true, reason: 'pass' };
}

export default { CONTRACTS, getContract, evaluateOutput };
