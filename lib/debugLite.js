/**
 * /debug — Phase B+C
 * Diagnosis: trimmed source
 * apply: queue (PHASEC_CONFIRM=1) or direct push
 */
import { powerChat } from './powerhouse.js';
import { applyOrQueue, handlePhaseC } from './phaseC.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function ghHeaders() {
  return {
    Authorization:
      'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Debug',
  };
}

function repoParts() {
  const r =
    process.env.GITHUB_REPO ||
    'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

async function ghGetFile(filePath) {
  const { owner, name } = repoParts();
  const clean = String(filePath || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      clean,
    { headers: ghHeaders() }
  );
  if (!res.ok) throw new Error('GitHub GET ' + clean + ' → ' + res.status);
  const j = await res.json();
  if (j.type !== 'file' || !j.content) throw new Error('Not a file: ' + clean);
  return {
    path: clean,
    content: Buffer.from(j.content, 'base64').toString('utf8'),
    sha: j.sha,
  };
}

function balanceOk(src) {
  let a = 0,
    b = 0,
    c = 0;
  let inS = false,
    inD = false,
    inT = false,
    esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && (inS || inD || inT)) {
      esc = true;
      continue;
    }
    if (!inD && !inT && ch === "'") {
      inS = !inS;
      continue;
    }
    if (!inS && !inT && ch === '"') {
      inD = !inD;
      continue;
    }
    if (!inS && !inD && ch === '`') {
      inT = !inT;
      continue;
    }
    if (inS || inD || inT) continue;
    if (ch === '(') a++;
    else if (ch === ')') a--;
    else if (ch === '[') b++;
    else if (ch === ']') b--;
    else if (ch === '{') c++;
    else if (ch === '}') c--;
    if (a < 0 || b < 0 || c < 0) return false;
  }
  return a === 0 && b === 0 && c === 0;
}

function trimForDiagnosis(source, maxChars) {
  const src = String(source || '');
  const limit = maxChars || 9000;
  if (src.length <= limit) return src;
  const head = src.slice(0, Math.floor(limit * 0.55));
  const tail = src.slice(-Math.floor(limit * 0.25));
  return (
    head +
    '\n\n/* … trimmed ' +
    (src.length - limit) +
    ' chars … */\n\n' +
    tail
  );
}

function formatAiError(r) {
  if (!r) return 'unknown';
  const parts = [];
  if (r.error) parts.push(String(r.error));
  if (r.tried && r.tried.length) parts.push(r.tried.join(' | '));
  return parts.join(' · ').slice(0, 800) || 'All engines failed';
}

export async function handleDebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';

  // Phase C surgeon commands first
  const phase = await handlePhaseC({ text, ctx });
  if (phase !== null && phase !== undefined) return phase;

  const raw = String(text || '')
    .replace(/^\/debug(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🛠 DEBUG · Phase C\n\n' +
      '/debug <error paste>\n' +
      '/debug file lib/x.js :: explain\n' +
      '/debug file lib/x.js :: apply :: <fix>\n' +
      '/debug fix list\n' +
      '/debug fix confirm <id>\n' +
      '/debug fix reject <id>\n\n' +
      'PHASEC_CONFIRM=1 → apply queues instead of push'
    );
  }

  const fileMatch = raw.match(
    /^file\s+(\S+)\s*::\s*(?:(apply)\s*::\s*)?([\s\S]+)$/i
  );

  if (fileMatch) {
    const filePath = fileMatch[1].replace(/^\//, '');
    const doApply = String(fileMatch[2] || '').toLowerCase() === 'apply';
    const problem = fileMatch[3].trim();

    let file;
    try {
      file = await ghGetFile(filePath);
    } catch (e) {
      return '❌ Fetch failed: ' + (e.message || e);
    }

    if (doApply) {
      if (file.content.length > 25000) {
        return '⚠️ File too large for apply (' + file.content.length + ')';
      }
      const r = await powerChat(
        'FILE: ' +
          filePath +
          '\nPROBLEM: ' +
          problem +
          '\n\nFULL SOURCE:\n' +
          file.content +
          '\n\nOutput COMPLETE fixed JS only. Balanced braces. No markdown.',
        {
          system: 'Surgeon. Output only valid JS for ' + filePath,
          maxTokens: 6000,
          temperature: 0.05,
        }
      );
      if (!r.ok) return '❌ Apply AI fail: ' + formatAiError(r);
      let body = String(r.text || '')
        .replace(/^```(?:js|javascript)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();
      if (body.length < 40) return '❌ Empty patch.';
      if (!balanceOk(body)) return '❌ Unbalanced braces — not saved.';

      const applied = await applyOrQueue({
        filePath,
        content: body,
        sha: file.sha,
        reason: problem.slice(0, 200),
      });
      if (!applied.ok) return '❌ ' + (applied.error || 'apply failed');
      if (applied.id) {
        return (
          '⏳ QUEUED patch id=' +
          applied.id +
          '\nFile: `' +
          filePath +
          '`\nConfirm: /debug fix confirm ' +
          applied.id +
          '\nList: /debug fix list'
        );
      }
      return (
        '✅ Pushed `' +
        filePath +
        '`\n⏳ Vercel 30–60s then re-test.\nEngine: ' +
        (r.engine || '')
      );
    }

    // Diagnosis
    const snippet = trimForDiagnosis(file.content, 8500);
    const r = await powerChat(
      'FILE: ' +
        filePath +
        ' (' +
        file.content.length +
        ' chars)\nPROBLEM: ' +
        problem +
        '\n\nSNIPPET:\n' +
        snippet +
        '\n\nBullets: root cause, where, fix steps, tests. No full dump.',
      {
        system: 'Staff engineer. Max 12 short bullets.',
        maxTokens: 900,
        temperature: 0.15,
      }
    );
    if (!r.ok) {
      return '❌ Debug AI fail: ' + formatAiError(r);
    }
    return (
      '🛠 DEBUG FILE · ' +
      filePath +
      ' · ' +
      (r.engine || '') +
      '\n\n' +
      r.text.slice(0, 3500) +
      '\n\nApply: /debug file ' +
      filePath +
      ' :: apply :: ' +
      problem.slice(0, 60)
    );
  }

  const r = await powerChat(
    'PasiyaOS diagnose:\n\n' + raw.slice(0, 5000),
    { system: 'Staff engineer. Concise.', maxTokens: 1000, temperature: 0.15 }
  );
  if (!r.ok) return '❌ Debug failed: ' + formatAiError(r);
  return '🛠 DEBUG · ' + (r.engine || '') + '\n\n' + r.text;
}

export default { handleDebug };
