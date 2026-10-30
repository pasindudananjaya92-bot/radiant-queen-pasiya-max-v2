/**
 * hullSkills.js — Agent-9.2 + Agent-13 expanded skill pack
 * research, browse, syntax_check, shell_py, shadow_due, dna_digest,
 * httpget, hash, json_get, echo_job
 */
'use strict';

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
  'researchdeep',
  'shadow_due',
  'syntax_check',
  'shell_py',
  'dna_digest',
  'browse',
  'httpget',
  'hash',
  'json_get',
  'echo_job',
];

const ALIASES = {
  researchdeep: 'research',
  deep_research: 'research',
  deepresearch: 'research',
  dna: 'dna_digest',
  dna_digest: 'dna_digest',
  syntax: 'syntax_check',
  http: 'httpget',
  fetch: 'httpget',
  echo: 'echo_job',
};

function normalizeSkill(name) {
  let s = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/^\//, '');
  s = s.split(/\s+/)[0] || s;
  return ALIASES[s] || s;
}

function extractQuery(p, job) {
  const bag = p || {};
  const j = job || {};
  let q =
    bag.query ||
    bag.q ||
    bag.topic ||
    bag.input ||
    bag.text ||
    (bag.meta && (bag.meta.query || bag.meta.topic)) ||
    j.query ||
    j.topic ||
    '';
  q = String(q || '').trim();
  if (/^\/?(research(deep)?|browse|httpget)\s+/i.test(q)) {
    q = q.replace(/^\/?(research(deep)?|browse|httpget)\s+/i, '').trim();
  }
  if (!q && j.text) {
    q = String(j.text)
      .replace(/^\/?(research(deep)?|browse|httpget)\s+/i, '')
      .trim();
  }
  return q;
}

async function runResearch(p, meta) {
  const q = extractQuery(p, meta && meta.job);
  if (!q) {
    return { ok: false, error: 'research needs query', query: '' };
  }
  var vaneErr;
  try {
    const vane = await import('./vaneAnswer.js');
    if (typeof vane.answerWithCitations === 'function') {
      return await vane.answerWithCitations(q, { focus: (p && p.focus) || 'web' });
    }
    if (typeof vane.answerWeb === 'function') {
      return await vane.answerWeb(q, { focus: (p && p.focus) || 'web' });
    }
    if (typeof vane.default === 'function') return await vane.default(q);
  } catch (e) {
    vaneErr = e;
  }
  try {
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
      error: vaneErr ? String(vaneErr.message || vaneErr) : undefined,
    };
  } catch (e2) {
    return {
      ok: false,
      query: q,
      error: String((vaneErr && vaneErr.message) || e2.message || e2),
    };
  }
}

export async function runSkill(name, payload = {}, meta = {}) {
  const skill = normalizeSkill(name);
  const p = payload || {};

  if (skill === 'echo_job') {
    return {
      ok: true,
      echo: p,
      meta: meta && meta.jobId ? { jobId: meta.jobId } : {},
      ts: Date.now(),
    };
  }

  if (skill === 'hash') {
    const crypto = await import('crypto');
    const text = String(p.text || p.query || p.input || '');
    const algo = String(p.algo || 'sha256');
    const h = crypto.createHash(algo).update(text, 'utf8').digest('hex');
    return { ok: true, algo: algo, hex: h, bytes: text.length };
  }

  if (skill === 'json_get') {
    const raw = p.json || p.text || p.query || '{}';
    let obj;
    try {
      obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: 'invalid json: ' + (e.message || e) };
    }
    const path = String(p.path || '').trim();
    if (!path) return { ok: true, json: obj };
    const parts = path.split('.').filter(Boolean);
    let cur = obj;
    for (const k of parts) {
      if (cur == null) break;
      cur = cur[k];
    }
    return { ok: true, path: path, value: cur };
  }

  if (skill === 'httpget') {
    const url = String(p.url || p.query || extractQuery(p) || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('httpget needs url (https://...)');
    }
    const r = await fetch(url, {
      headers: { 'User-Agent': 'PasiyaOS-HullSkill/1.0', Accept: 'text/*,application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    return {
      ok: r.ok,
      status: r.status,
      url: url,
      bytes: text.length,
      body: text.slice(0, 6000),
    };
  }

  if (skill === 'shadow_due') {
    try {
      const mod = await import('./shadowTwin.js');
      const fn = mod.deliverDue || (mod.default && mod.default.deliverDue);
      if (typeof fn !== 'function') throw new Error('deliverDue missing');
      return await fn(Number(p.limit) || 5);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  if (skill === 'dna_digest') {
    try {
      const g = await import('./cronPhaseG.js');
      return await g.jobDnaDigest();
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  if (skill === 'syntax_check') {
    const path = String(p.path || p.file || '').trim();
    if (!path) throw new Error('syntax_check needs path');
    const sc = await import('./surgeonContext.js');
    const file = await sc.ghGet(path);
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
    const url = String(p.url || p.query || extractQuery(p) || '').trim();
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
    const code = String(p.code || p.source || 'print(2+2)').slice(0, 4000);
    const r = await fetch(
      'https://ce.judge0.com/submissions?base64_encoded=false&wait=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_code: code, language_id: 71 }),
        signal: AbortSignal.timeout(25000),
      }
    );
    const j = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      stdout: (j.stdout || '').slice(0, 3000),
      stderr: (j.stderr || '').slice(0, 1000),
      status: j.status,
    };
  }

  if (skill === 'research') {
    return await runResearch(p, meta);
  }

  throw new Error('Unknown skill: ' + skill + ' · try: ' + SKILL_NAMES.join(', '));
}

export async function processSkillJob(job) {
  const kind = normalizeSkill(
    job.kind || job.type || job.skill || (job.payload && job.payload.skill) || 'research'
  );
  const rawPayload = job.payload || job.input || {};
  const payload = {
    ...rawPayload,
    query:
      rawPayload.query ||
      rawPayload.q ||
      rawPayload.topic ||
      job.query ||
      job.topic ||
      '',
    topic: rawPayload.topic || job.topic || rawPayload.query || '',
    text: rawPayload.text || job.text || '',
    url: rawPayload.url || '',
  };
  if (!payload.query && job.text) {
    payload.query = String(job.text)
      .replace(/^\/?(research(deep)?|httpget|browse)\s+/i, '')
      .trim();
  }

  const result = await runSkill(kind, payload, { jobId: job.id, job });
  const chatId =
    job.chat_id ||
    job.chatId ||
    (job.payload && job.payload.chatId) ||
    ADMIN();
  if (chatId && result) {
    const preview =
      typeof result === 'string'
        ? result
        : JSON.stringify(result).slice(0, 3500);
    await tgSend(chatId, '🛰 Skill · ' + kind + '\n' + preview);
  }
  return result;
}

export default { SKILL_NAMES, runSkill, processSkillJob, normalizeSkill, extractQuery };
