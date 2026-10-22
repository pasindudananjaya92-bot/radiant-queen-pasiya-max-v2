/**
 * /sandbox — lightweight code run (Judge0 CE free)
 * languages: js, py, bash(limited)
 */
const JUDGE0 = 'https://ce.judge0.com';

const LANG = {
  js: 63, // javascript
  javascript: 63,
  py: 71,
  python: 71,
  bash: 46,
  sh: 46,
};

export async function runSandbox(lang, source) {
  const language_id = LANG[String(lang || 'js').toLowerCase()];
  if (!language_id) {
    return { ok: false, error: 'lang: js | py | bash' };
  }
  const code = String(source || '').slice(0, 8000);
  if (!code.trim()) return { ok: false, error: 'empty source' };

  try {
    const res = await fetch(JUDGE0 + '/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language_id,
        source_code: code,
        stdin: '',
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      return { ok: false, error: JSON.stringify(j).slice(0, 200) };
    }
    const out = [j.stdout, j.stderr, j.compile_output, j.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    return {
      ok: true,
      status: j.status?.description || '',
      output: out.slice(0, 3000) || '(no output)',
      time: j.time,
      memory: j.memory,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function formatSandbox(r) {
  if (!r.ok) return '❌ Sandbox: ' + (r.error || 'fail');
  return (
    `🧪 SANDBOX · ${r.status || 'done'}\n` +
    (r.time != null ? `time=${r.time}s mem=${r.memory}\n` : '') +
    '```\n' +
    r.output +
    '\n```'
  ).slice(0, 3500);
}

export default { runSandbox, formatSandbox };
