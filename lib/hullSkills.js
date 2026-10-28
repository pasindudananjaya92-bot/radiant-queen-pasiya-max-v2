/**
 * V6000 Hull B / local skill pack
 * Skills: research, shadow_due, syntax_check, shell_py, dna_digest, browse
 */
import { createHash } from 'crypto';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

async function tgSend(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) }),
  });
}

export const SKILL_NAMES = [
  'research',
  'shadow_due',
  'syntax_check',
  'shell_py',
  'dna_digest',
  'browse',
];

export async function runSkill(name, payload = {}, meta = {}) {
  const skill = String(name || '').toLowerCase();
  const p = payload || {};

  if (skill === 'shadow_due') {
    const mod = await import('./shadowTwin.js');
    const fn = mod.deliverDue || (mod.default && mod.default.deliverDue);
    if (typeof fn !== 'function') throw new Error('deliverDue missing');
    return await fn(Number(p.limit) || 5);
  }

  if (skill === 'dna_digest') {
    const g = await import('./cronPhaseG.js');
    return await g.jobDnaDigest();
  }

  if (skill === 'syntax_check') {
    const path = String(p.path || p.file || '').trim();
    if (!path) throw new Error('syntax_check needs path');
    const sc = await import('./surgeonContext.js');
    const getFile = sc.ghGet || (sc.default && sc.default.ghGet);
    if (typeof getFile !== 'function') throw new Error('ghGet missing from surgeonContext');
    const file = await getFile(path);
    const issues = sc.quickSyntaxHints(file.content);
    return {
      path: file.path,
      ok: issues.length === 0,
      issues,
      bytes: file.content.length,
      sha: file.sha,
    };
  }

  if (skill === 'browse') {
    const url = String(p.url || '').trim();
    if (!url) throw new Error('browse needs url');
    const jina = 'https://r.jina.ai/http://' + url.replace(/^https?:\/\//, '');
    const r = await fetch(jina, {
      headers: { Accept: 'text/markdown' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    return { url, ok: r.ok, markdown: String(text).slice(0, 6000) };
  }

  if (skill === 'shell_py') {
    // Judge0 CE free — python only, short
    const code = String(p.code || p.source || 'print(2+2)').slice(0, 4000);
    const r = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code: code,
        language_id: 71, // Python 3
        stdin: String(p.stdin || ''),
      }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      stdout: (j.stdout || '').slice(0, 2000),
      stderr: (j.stderr || j.compile_output || '').slice(0, 1000),
      status: j.status,
    };
  }

  if (skill === 'research') {
    // Soft import vane / searchJobs
    try {
      const vane = await import('./vaneAnswer.js');
      const q = String(p.query || p.q || '').trim();
      if (!q) throw new Error('research needs query');
      if (typeof vane.answerWithCitations === 'function') {
        return await vane.answerWithCitations(q, { focus: p.focus || 'web' });
      }
      if (typeof vane.default === 'function') return await vane.default(q);
    } catch (e) {
      // jina fallback
      const q = String(p.query || p.q || '').trim();
      const r = await fetch(
        'https://r.jina.ai/http://duckduckgo.com/html/?q=' + encodeURIComponent(q),
        { signal: AbortSignal.timeout(20000) }
      );
      const md = await r.text();
      return {
        ok: true,
        fallback: 'jina',
        query: q,
        text: String(md).slice(0, 4000),
        error: e.message,
      };
    }
  }

  throw new Error('Unknown skill: ' + skill + ' · try: ' + SKILL_NAMES.join(', '));
}

/** Queue-friendly process entry used by hullWorker */
export async function processSkillJob(job) {
  const kind = String(job.kind || job.type || job.skill || 'research').toLowerCase();
  const payload = job.payload || job.input || {};
  const result = await runSkill(kind, payload, { jobId: job.id });
  const chatId = job.chat_id || job.chatId || ADMIN();
  if (chatId && result) {
    const preview =
      typeof result === 'string'
        ? result
        : JSON.stringify(result).slice(0, 3500);
    await tgSend(
      chatId,
      '🛰 Skill · ' + kind + '\n' + preview
    );
  }
  return result;
}

export default { SKILL_NAMES, runSkill, processSkillJob };
