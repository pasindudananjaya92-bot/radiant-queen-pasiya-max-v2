/**
 * lib/universeShell.js — Universe Shell Lite (Piston free sandbox)
 * https://emkc.org/api/v2/piston — no API key
 * Limits: short CPU time, no network in most runtimes, founder-only recommended
 */

const PISTON = process.env.PISTON_API || 'https://emkc.org/api/v2/piston';
const MAX_CODE = 12000;
const MAX_OUT = 8000;

const LANG_MAP = {
  js: 'javascript',
  javascript: 'javascript',
  node: 'javascript',
  py: 'python',
  python: 'python',
  python3: 'python',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  typescript: 'typescript',
  php: 'php',
  ruby: 'ruby',
  rb: 'ruby',
  go: 'go',
  rust: 'rust',
  c: 'c',
  cpp: 'c++',
  'c++': 'c++',
};

export function resolveLang(lang) {
  const k = String(lang || 'javascript').toLowerCase().trim();
  return LANG_MAP[k] || k;
}

/** Block obvious destructive host patterns (defense in depth — sandbox already isolated) */
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

export async function pistonRuntimes() {
  const res = await fetch(PISTON + '/runtimes');
  if (!res.ok) return { ok: false, error: 'runtimes HTTP ' + res.status };
  const list = await res.json();
  return { ok: true, runtimes: list };
}

export async function execCode({ language, code, stdin = '' }) {
  const lang = resolveLang(language);
  const guard = staticShellGuard(code);
  if (!guard.ok) return { ok: false, error: guard.reason };

  // pick latest version from runtimes
  let version = '*';
  try {
    const rt = await pistonRuntimes();
    if (rt.ok) {
      const match = (rt.runtimes || []).filter((r) => r.language === lang || (r.aliases || []).includes(lang));
      if (match.length) version = match[match.length - 1].version;
    }
  } catch (_) {}

  const res = await fetch(PISTON + '/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: lang,
      version,
      files: [{ name: lang === 'python' ? 'main.py' : lang === 'bash' ? 'script.sh' : 'main.js', content: String(code) }],
      stdin: String(stdin || ''),
      run_timeout: 10000,
    }),
  });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || JSON.stringify(j).slice(0, 200) };

  const run = j.run || {};
  const compile = j.compile || {};
  let out = '';
  if (compile.stderr) out += '[compile stderr]\n' + compile.stderr + '\n';
  if (run.stdout) out += run.stdout;
  if (run.stderr) out += (out ? '\n' : '') + '[stderr]\n' + run.stderr;
  if (run.code !== undefined && run.code !== 0) out += '\n[exit ' + run.code + ']';
  out = out.slice(0, MAX_OUT) || '(no output)';

  return {
    ok: true,
    language: lang,
    version: j.version || version,
    output: out,
    exitCode: run.code,
  };
}

/** Parse /shell python\ncode or /shell `code` */
export function parseShellArgs(text) {
  const raw = String(text || '').trim();
  // /shell py: print(1)
  const m = raw.match(/^(\w+)[\s:]+([\s\S]+)$/);
  if (m && LANG_MAP[m[1].toLowerCase()]) {
    return { language: resolveLang(m[1]), code: m[2].trim() };
  }
  // default javascript
  if (raw) return { language: 'javascript', code: raw };
  return null;
}

export function formatExec(r) {
  if (!r.ok) return '❌ Shell: ' + r.error;
  return (
    '🐚 ' +
    r.language +
    (r.version ? '@' + r.version : '') +
    '\n```\n' +
    r.output +
    '\n```'
  );
}

export default { execCode, parseShellArgs, formatExec, resolveLang, pistonRuntimes };
