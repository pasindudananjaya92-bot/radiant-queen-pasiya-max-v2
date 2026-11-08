// lib/evidenceEngine.js
// Agent-27 Phase 2 — STRICT relevance gate (health/vault cannot answer unrelated questions)
// Cache + reflect×2 kept.

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { runTool, toolCatalogForPrompt } from './toolRegistry.js';

const SOFT_MS = 8000;
const MAX_TOOLS = 2;
const MAX_REFLECT = 2;
const CACHE_TTL_SEC = 3600;

const NEGATIVE_RE =
  /cannot find|can't find|could not find|no (relevant )?info|not (found|mentioned|present|available)|don'?t know|no evidence|insufficient|no results|nothing (found|relevant)|no matching|empty/i;

const TOOL_INTENTS = {
  health_check: ['health', 'system', 'supabase', 'vercel', 'status', 'uptime', 'operational', 'down', 'error', 'make', 'cron', 'snap', 'server'],
  vault_list: ['vault', 'storage', 'uploaded', 'files in vault', 'bucket'],
  doc_ask: ['doc', 'document', 'pdf', 'report', 'profit', 'budget', 'invoice', 'contract', 'summar', 'page', 'lumen', 'finance'],
  mem_search: ['mem', 'memory', 'remember', 'note', 'todo', 'notes'],
};

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function msSince(t0) {
  return Date.now() - t0;
}

function normalizePrompt(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function cacheKey(userId, prompt) {
  return createHash('sha256').update(String(userId) + '|' + normalizePrompt(prompt) + '|v2.4-scope').digest('hex');
}

function extractJson(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

function questionTokens(question) {
  return normalizePrompt(question)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 16);
}

function isSystemQuestion(question) {
  const q = normalizePrompt(question);
  return /\b(health|system|supabase|vercel|uptime|operational|server|status|cron|snap|make webhook|පද්ධති)\b/i.test(q);
}

function isVaultQuestion(question) {
  const q = normalizePrompt(question);
  return /\b(vault|storage|bucket|uploaded files|files in vault)\b/i.test(q);
}

function isDocishQuestion(question) {
  const q = normalizePrompt(question);
  // Explicit doc/file OR finance-report style internal facts
  return /\b(doc|document|pdf|report|invoice|contract|lumen|finance doc|the (finance )?doc|this (file|document)|indexed|page \d+)\b/i.test(
    q
  );
}

function isMemishQuestion(question) {
  const q = normalizePrompt(question);
  return /\b(mem|memory|remember|note|todo|notes|මතක)\b/i.test(q);
}

function isFinanceInternalQuestion(question) {
  const q = normalizePrompt(question);
  // profit/budget WITH finance/doc/report context → internal doc, NOT web
  if (/\b(profit|net profit|budget|revenue|expansion budget)\b/i.test(q)) {
    if (/\b(doc|document|report|finance|lumen|our|vault|indexed)\b/i.test(q)) return true;
    // "net profit in the finance doc" style already caught; bare "net profit" alone → still prefer doc first
    if (/\b(in the|from the|according to)\b/i.test(q)) return true;
  }
  return false;
}

/**
 * STRICT single-scope allowlist — do NOT mix web with doc/health.
 * Priority: system > vault > doc/finance-internal > mem > web (general only)
 */
function allowedToolsForQuestion(question) {
  const allow = new Set();
  const q = normalizePrompt(question);

  // 1) System health only
  if (isSystemQuestion(question) && !isDocishQuestion(question) && !isFinanceInternalQuestion(question)) {
    allow.add('health_check');
    return allow;
  }

  // 2) Vault only
  if (isVaultQuestion(question) && !isDocishQuestion(question)) {
    allow.add('vault_list');
    return allow;
  }

  // 3) Document / internal finance — NO web (prevents contamination)
  if (isDocishQuestion(question) || isFinanceInternalQuestion(question)) {
    allow.add('doc_ask');
    if (isMemishQuestion(question)) allow.add('mem_search');
    return allow;
  }

  // 4) Explicit memory
  if (isMemishQuestion(question)) {
    allow.add('mem_search');
    return allow;
  }

  // 5) General knowledge / public facts — web only (skip empty doc/mem noise)
  allow.add('web_search');
  return allow;
}

function toolFitsQuestion(tool, question) {
  return allowedToolsForQuestion(question).has(String(tool || ''));
}

function evidenceRelevantToQuestion(e, question) {
  const text = `${e.claim_hint || ''} ${e.snippet || ''}`;
  if (NEGATIVE_RE.test(text)) return false;
  if (e.raw_score === 0) return false;
  const qTokens = questionTokens(question).filter((w) => w.length > 3);
  const low = text.toLowerCase();

  if (e.source_type === 'health') return toolFitsQuestion('health_check', question);
  if (e.source_type === 'vault') {
    if (!toolFitsQuestion('vault_list', question)) return false;
    return true;
  }
  if (e.source_type === 'web') {
    if (!qTokens.length) return true;
    const hits = qTokens.filter((t) => low.includes(t)).length;
    // web snippets often paraphrase — allow if any token hits OR title-like
    return hits > 0 || low.length > 40;
  }
  if (e.source_type === 'doc' || e.source_type === 'mem') {
    if (!qTokens.length) return !NEGATIVE_RE.test(text);
    const hits = qTokens.filter((t) => low.includes(t)).length;
    return hits > 0;
  }
  return false;
}

function filterEvidence(evidenceList, question) {
  return (evidenceList || []).filter((e) => evidenceRelevantToQuestion(e, question));
}

function scoreEvidence(evidenceList) {
  const claims = (evidenceList || []).map((e) => {
    let base = Number(e.raw_score);
    if (Number.isNaN(base)) {
      base = e.source_type === 'doc' ? 90 : e.source_type === 'health' ? 85 : e.source_type === 'mem' ? 70 : e.source_type === 'vault' ? 65 : 20;
    }
    return { text: String(e.claim_hint || e.snippet || '').slice(0, 300), trust: Math.max(0, Math.min(100, base)), sources: [`${e.source_type}:${e.source_id || '?'}`] };
  });
  if (!claims.length) return { overall_trust: 20, claims: [], confidence_label: 'LOW', empty: true };
  const overall = Math.round(claims.reduce((a, c) => a + c.trust, 0) / claims.length);
  return { overall_trust: overall, claims, confidence_label: overall >= 80 ? 'HIGH' : overall >= 60 ? 'MEDIUM' : 'LOW', empty: false };
}

async function llmComplete(messages, purpose = 'think') {
  const attempts = [];
  const groqKey = process.env.GROQ_API_KEY || '';
  if (groqKey) {
    attempts.push(async () => {
      const model = process.env.THINK_GROQ_MODEL || (process.env.GROQ_MODEL || '').split(',')[0] || 'llama-3.3-70b-versatile';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: purpose === 'plan' ? 0.1 : 0.25, max_tokens: purpose === 'plan' ? 700 : 1100 }),
        signal: AbortSignal.timeout(5500),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || 'Groq ' + res.status);
      return { text: j.choices?.[0]?.message?.content || '', provider: 'groq', model };
    });
  }
  const gKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
  if (gKey) {
    attempts.push(async () => {
      const model = process.env.THINK_GEMINI_MODEL || 'gemini-2.0-flash';
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(gKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: 'user', parts: [{ text: user || '...' }] }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 1100 },
        }),
        signal: AbortSignal.timeout(5500),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || 'Gemini ' + res.status);
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return { text, provider: 'gemini', model };
    });
  }
  let last = 'No LLM (GROQ_API_KEY or GEMINI_API_KEY)';
  for (const fn of attempts) {
    try { return await fn(); } catch (e) { last = e.message || String(e); }
  }
  throw new Error(last);
}

function heuristicPlan(question, avoidTools = new Set()) {
  const steps = [];
  const allow = allowedToolsForQuestion(question);
  const add = (id, tool, args, why) => {
    if (avoidTools.has(tool)) return;
    if (!allow.has(tool)) return;
    if (steps.some((s) => s.tool === tool)) return;
    steps.push({ id, tool, args, why });
  };
  if (allow.has('health_check')) add('s1', 'health_check', {}, 'system only');
  if (allow.has('vault_list')) add('s1', 'vault_list', {}, 'vault only');
  if (allow.has('doc_ask')) add('s1', 'doc_ask', { question }, 'document only');
  if (allow.has('mem_search')) add('s1', 'mem_search', { query: question }, 'memory only');
  if (allow.has('web_search')) add('s1', 'web_search', { query: question }, 'web only');
  return { type: 'plan', goal: question, steps: steps.slice(0, 2), stop_when: 'first solid evidence' };
}

function sanitizePlan(plan, question) {
  const steps = (plan?.steps || []).filter((s) => toolFitsQuestion(String(s.tool || ''), question));
  if (!steps.length) return heuristicPlan(question);
  return { ...plan, steps: steps.slice(0, MAX_TOOLS) };
}

async function getCache(userId, prompt) {
  const client = sb();
  if (!client) return null;
  try {
    const { data } = await client.from('think_cache').select('response, expires_at').eq('cache_key', cacheKey(userId, prompt)).maybeSingle();
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.response;
  } catch { return null; }
}

async function setCache(userId, prompt, envelope) {
  const client = sb();
  if (!client) return;
  try {
    await client.from('think_cache').upsert({
      cache_key: cacheKey(userId, prompt),
      user_id: String(userId),
      prompt_norm: normalizePrompt(prompt),
      response: envelope,
      overall_trust: envelope.overall_trust,
      expires_at: new Date(Date.now() + CACHE_TTL_SEC * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
  } catch { /* optional */ }
}

async function saveTrace(row) {
  const client = sb();
  if (!client) return null;
  try {
    const { data } = await client.from('think_traces').insert(row).select('id').maybeSingle();
    return data?.id || null;
  } catch { return null; }
}

async function logEvidence(traceId, evidenceList) {
  const client = sb();
  if (!client || !evidenceList?.length) return;
  try {
    await client.from('evidence_logs').insert(
      evidenceList.slice(0, 30).map((e) => ({
        trace_id: traceId,
        source_type: e.source_type,
        source_id: String(e.source_id || ''),
        snippet: String(e.snippet || e.claim_hint || '').slice(0, 500),
        score: e.raw_score ?? null,
        meta: e,
        created_at: new Date().toISOString(),
      }))
    );
  } catch { /* optional */ }
}

async function runPlanSteps(plan, ctx, t0, stepsLog, question) {
  const toolResults = [];
  const evidence = [];
  for (const step of (plan?.steps || []).slice(0, MAX_TOOLS)) {
    if (msSince(t0) >= SOFT_MS) {
      stepsLog.push({ event: 'soft_timeout', at_ms: msSince(t0) });
      break;
    }
    const tool = String(step.tool || '');
    if (!toolFitsQuestion(tool, question)) {
      stepsLog.push({ step_id: step.id, tool, ok: false, skipped: true, reason: 'tool_not_relevant_to_question' });
      continue;
    }
    const result = await runTool(tool, step.args || {}, ctx);
    const cleanedEv = filterEvidence(result.evidence || [], question);
    result.evidence = cleanedEv;
    if (cleanedEv.length === 0 && result.data?.answer && NEGATIVE_RE.test(String(result.data.answer))) result.ok = false;
    stepsLog.push({ step_id: step.id, tool, ok: result.ok, elapsed_ms: result.elapsed_ms, error: result.error, evidence_n: cleanedEv.length });
    toolResults.push(result);
    evidence.push(...cleanedEv);
    // Early stop — do not run more tools that can contradict / burn time
    if (cleanedEv.length > 0 && (tool === 'doc_ask' || tool === 'health_check' || tool === 'web_search' || tool === 'vault_list')) {
      break;
    }
  }
  return { toolResults, evidence };
}

export async function runEvidenceThink(question, ctx = {}) {
  const t0 = Date.now();
  const userId = String(ctx.userId || ctx.from?.id || process.env.ADMIN_ID || '');
  const toolCtx = { userId, from: ctx.from };
  const stepsLog = [];
  const providersUsed = [];

  const cached = await getCache(userId, question);
  if (cached && cached.answer_markdown) {
    const text = String(cached.answer_markdown);
    const withCache = /cache hit/i.test(text) ? text : text + '\n\n_(cache hit · 0 LLM)_';
    return { text: withCache.slice(0, 3900), envelope: { ...cached, cached: true } };
  }

  let plan = null;
  let toolResults = [];
  let allEvidence = [];
  let retries = 0;
  let status = 'done';
  let partial = false;

  try {
    if (msSince(t0) < SOFT_MS - 1500) {
      const planRes = await llmComplete([
        { role: 'system', content: 'Return ONLY JSON type=plan. STRICT: Pick ONE primary tool only. health_check ONLY for system health. doc_ask ONLY for documents/reports/finance docs — NEVER combine with web_search. web_search ONLY for public/general knowledge — NEVER with doc_ask. mem_search ONLY when asked about memories/notes. vault_list ONLY for vault files. No markdown.' },
        { role: 'user', content: `Catalog:\n${toolCatalogForPrompt()}\nMax ${MAX_TOOLS} steps.\nQuestion: ${question}` },
      ], 'plan');
      providersUsed.push(planRes.provider);
      plan = extractJson(planRes.text);
    }
  } catch (e) {
    stepsLog.push({ event: 'plan_llm_error', error: e.message });
  }

  plan = sanitizePlan(plan || heuristicPlan(question), question);
  stepsLog.push({ event: 'plan_sanitized', tools: plan.steps.map((s) => s.tool) });

  let pack = await runPlanSteps(plan, toolCtx, t0, stepsLog, question);
  toolResults = pack.toolResults;
  allEvidence = filterEvidence(pack.evidence, question);
  let verify = scoreEvidence(allEvidence);

  while (verify.overall_trust < 60 && retries < MAX_REFLECT && msSince(t0) < SOFT_MS - 2000) {
    retries += 1;
    const used = new Set(toolResults.map((t) => t.tool));
    const alt = sanitizePlan(heuristicPlan(question, used), question);
    stepsLog.push({ event: 'reflect', n: retries, trust: verify.overall_trust, next: alt.steps.map((s) => s.tool) });
    if (!alt.steps.length) break;
    const pack2 = await runPlanSteps(alt, toolCtx, t0, stepsLog, question);
    toolResults = toolResults.concat(pack2.toolResults);
    allEvidence = filterEvidence(allEvidence.concat(pack2.evidence), question);
    verify = scoreEvidence(allEvidence);
  }

  if (msSince(t0) >= SOFT_MS) { partial = true; status = 'partial'; }

  // CRITICAL: re-filter + rescore right before answer (never trust stale high scores)
  allEvidence = filterEvidence(allEvidence, question);
  verify = scoreEvidence(allEvidence);

  // Partial timeout with no relevant evidence => always LOW (never average junk)
  if (partial && (verify.empty || allEvidence.length === 0)) {
    verify = { overall_trust: 20, claims: [], confidence_label: 'LOW', empty: true };
  }

  let answerText = '';
  if (verify.empty || allEvidence.length === 0) {
    verify = { overall_trust: 20, claims: [], confidence_label: 'LOW', empty: true };
    answerText = "**Low Confidence**\n\nI don't know — no evidence found in documents, memories, vault, or system health for this question.";
  } else {
    try {
      if (msSince(t0) < SOFT_MS - 1000) {
        const ans = await llmComplete([
          { role: 'system', content: 'Use ONLY relevant evidence. If it does not answer the question, say you do not know. Never treat system health as an answer to unrelated trivia.' },
          { role: 'user', content: `Question: ${question}\nTrust: ${verify.overall_trust}\nEvidence: ${JSON.stringify(allEvidence).slice(0, 8000)}` },
        ], 'answer');
        providersUsed.push(ans.provider);
        answerText = ans.text;
      }
    } catch (e) {
      stepsLog.push({ event: 'answer_llm_error', error: e.message });
    }
    if (!answerText) {
      answerText = allEvidence.slice(0, 5).map((e, i) => `${i + 1}. (${e.source_type}) ${e.claim_hint || e.snippet}`).join('\n');
    }
    if (verify.overall_trust < 60 && !/low confidence/i.test(answerText)) {
      answerText = '**Low Confidence**\n\n' + answerText;
    }
  }

  if (partial) answerText += '\n\n_(partial — soft time guard)_';

  const sources = [];
  for (const e of allEvidence) {
    const id = `${e.source_type}:${e.source_id || ''}`;
    if (!sources.find((s) => s.id === id)) sources.push({ type: e.source_type, id: e.source_id || '', label: id });
  }

  const footer =
    `\n\n——\nTrust: ${verify.overall_trust}/100 (${verify.confidence_label}) · tools: ${toolResults.map((t) => t.tool).join(', ') || 'none'} · retries: ${retries} · ${msSince(t0)}ms` +
    (partial ? ' · partial' : '');
  const finalText = (answerText.trim() + footer).slice(0, 3900);

  const envelope = {
    type: 'final',
    answer_markdown: finalText,
    overall_trust: verify.overall_trust,
    confidence_label: verify.confidence_label,
    sources,
    tools_used: toolResults.filter((t) => !t.skipped).map((t) => t.tool),
    retries,
    cached: false,
    partial,
  };

  if (!partial && !verify.empty && verify.overall_trust >= 60) await setCache(userId, question, envelope);

  const traceId = await saveTrace({
    user_id: userId,
    prompt: String(question).slice(0, 4000),
    status: verify.empty ? 'empty' : status,
    plan,
    steps: stepsLog,
    verify,
    final: envelope,
    overall_trust: verify.overall_trust,
    retries,
    providers: providersUsed,
    elapsed_ms: msSince(t0),
    created_at: new Date().toISOString(),
  });
  await logEvidence(traceId, allEvidence);

  return { text: finalText, envelope };
}

export default { runEvidenceThink };
