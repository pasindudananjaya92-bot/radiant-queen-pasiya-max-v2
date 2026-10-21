/**
 * lib/universeShell.js — Universe Shell Lite
 * Primary: Wandbox (no key) https://wandbox.org/api/compile.json
 * Fallback: Judge0 CE https://ce.judge0.com
 */
const MAX_CODE = 12000;
const MAX_OUT = 8000;

const WANDBOX_COMPILER = {
  python: 'cpython-3.12.1',
  python3: 'cpython-3.12.1',
  py: 'cpython-3.12.1',
  javascript: 'nodejs-20.11.0',
  js: 'nodejs-20.11.0',
  node: 'nodejs-20.11.0',
  typescript: 'typescript-5.3.3',
  ts: 'typescript-5.3.3',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  ruby: 'ruby-3.3.0',
  rb: 'ruby-3.3.0',
  go: 'go-1.22.0',
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  'c++': 'gcc-13.2.0',
  rust: 'rust-1.76.0',
  php: 'php-8.3.2',
};

// Judge0 language_id map (CE)
const JUDGE0_LANG = {
  python: 71,
  python3: 71,
  py: 71,
  javascript: 63,
  js: 63,
  node: 63,
  typescript: 74,
  bash: 46,
  sh: 46,
  c: 50,
  cpp: 54,
  'c++': 54,
  go: 60,
  rust: 73,
  ruby: 72,
  php: 68,
};

export function resolveLang(lang) {
  return String(lang || 'python').toLowerCase().trim();
}

export function staticShellGuard(code) {
  const s = String(code || '');
  const bad = [
    /curl\s+.*\|\s*(ba)?sh/i,
    /wget\s+.*\|\s*(ba)?sh/i,
    /rm\s+-rf\s+\/(?!\w)/i,
    /mkfs\./i,
    /dd\s+if=/i,
  ];
  for (const re of bad) {
    if (re.test(s)) return { ok: false, reason: 'Blocked pattern: ' + re };
  }
  if (s.length > MAX_CODE) return { ok: false, reason: 'Code too long (max ' + MAX_CODE + ')' };
  return { ok: true };
}

async function runWandbox(language, code, stdin) {
  let compiler = WANDBOX_COMPILER[language];
  // Discover compiler if fixed name fails later — try list for python/js
  if (!compiler) {
    try {
      const listRes = await fetch('https://wandbox.org/api/list.json');
      const list = await listRes.json();
      const want =
        language === 'python' || language === 'py' || language === 'python3'
          ? 'cpython'
          : language === 'javascript' || language === 'js' || language === 'node'
            ? 'nodejs'
            : language;
      const hit = (list || []).filter((c) => String(c.name || '').includes(want));
      if (hit.length) compiler = hit[hit.length - 1].name;
    } catch (_) {}
  }
  if (!compiler) return { ok: false, error: 'No Wandbox compiler for ' + language };

  const res = await fetch('https://wandbox.org/api/compile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler,
      code: String(code),
      stdin: String(stdin || ''),
      options: '',
    }),
  });
  if (!res.ok) return { ok: false, error: 'Wandbox HTTP ' + res.status };
  const j = await res.json();
  let out = '';
  if (j.compiler_error) out += '[compile]\n' + j.compiler_error + '\n';
  if (j.program_output) out += j.program_output;
  if (j.program_error) out += (out ? '\n' : '') + '[stderr]\n' + j.program_error;
  if (j.signal) out += '\n[signal ' + j.signal + ']';
  out = (out || '(no output)').slice(0, MAX_OUT);
  const status = j.status !== undefined ? Number(j.status) : 0;
  return {
    ok: true,
    provider: 'wandbox',
    language,
    version: compiler,
    output: out,
    exitCode: status,
  };
}

async function runJudge0(language, code, stdin) {
  const language_id = JUDGE0_LANG[language];
  if (!language_id) return { ok: false, error: 'Judge0: unsupported lang ' + language };
  const res = await fetch(
    'https://ce.judge0.com/submissions?base64_encoded=false&wait=true',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code: String(code),
        language_id,
        stdin: String(stdin || ''),
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: 'Judge0 HTTP ' + res.status + ' ' + t.slice(0, 120) };
  }
  const j = await res.json();
  let out = '';
  if (j.compile_output) out += '[compile]\n' + j.compile_output + '\n';
  if (j.stdout) out += j.stdout;
  if (j.stderr) out += (out ? '\n' : '') + '[stderr]\n' + j.stderr;
  if (j.message) out += (out ? '\n' : '') + j.message;
  out = (out || '(no output)').slice(0, MAX_OUT);
  return {
    ok: true,
    provider: 'judge0',
    language,
    version: 'lang_id=' + language_id,
    output: out,
    exitCode: j.status?.id === 3 ? 0 : j.status?.id,
  };
}

export async function execCode({ language, code, stdin = '' }) {
  const lang = resolveLang(language);
  const guard = staticShellGuard(code);
  if (!guard.ok) return { ok: false, error: guard.reason };

  // Wandbox first
  try {
    const w = await runWandbox(lang, code, stdin);
    if (w.ok) return w;
    // fallback
    const j0 = await runJudge0(lang, code, stdin);
    if (j0.ok) return j0;
    return { ok: false, error: (w.error || '') + ' | ' + (j0.error || 'all sandboxes failed') };
  } catch (e) {
    try {
      const j0 = await runJudge0(lang, code, stdin);
      if (j0.ok) return j0;
    } catch (_) {}
    return { ok: false, error: String(e.message || e) };
  }
}

export function parseShellArgs(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^(\w+)[\s:]+([\s\S]+)$/);
  if (m && (WANDBOX_COMPILER[m[1].toLowerCase()] || JUDGE0_LANG[m[1].toLowerCase()])) {
    return { language: resolveLang(m[1]), code: m[2].trim() };
  }
  if (raw) return { language: 'python', code: raw };
  return null;
}

export function formatExec(r) {
  if (!r.ok) return '❌ Shell: ' + r.error;
  return (
    '🐚 ' +
    r.language +
    (r.version ? ' · ' + r.version : '') +
    (r.provider ? ' · ' + r.provider : '') +
    '\n```\n' +
    r.output +
    '\n```'
  );
}

export default { execCode, parseShellArgs, formatExec, resolveLang };
