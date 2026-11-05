// lib/evidenceEngine.js
// Agent-27 Phase 2 — Evidence Engine + cache + reflect×2 + strict verify
// Phase 1 tools only (no web). Groq → Gemini. 8s soft guard.

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { runTool, toolCatalogForPrompt } from './toolRegistry.js';

const SOFT_MS = 8000;
const MAX_TOOLS = 4;
const MAX_REFLECT = 2;
const CACHE_TTL_SEC = 3600;

const NEGATIVE_RE =
  /cannot find|can't find|could not find|no (relevant )?info|not (found|mentioned|present|available)|don'?t know|no evidence|insufficient|no results|nothing (found|relevant)|no matching|empty/i;

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
  return String(q || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function cacheKey(userId, prompt) {
  return createHash('sha256')
    .update(String(userId) + '|' + normalizePrompt(prompt) + '|v2')
    .digest('hex');
}

function extractJson(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function questionTokens(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12);
}

/** Drop negative / irrelevant evidence before scoring */
function filterEvidence(evidenceList, question) {
  const tokens = questionTokens(question);
  const out = [];
  for (const e of evidenceList || []) {
    const text = `${e.claim_hint || ''} ${e.snippet || ''}`;
    if (NEGATIVE_RE.test(text)) continue;
    if (e.raw_score === 0) continue;

    // Relevance: at least one meaningful token overlap for doc/mem (health/vault looser)
    if (e.source_type === 'doc' || e.source_type === 'mem') {
      const low = text.toLowerCase();
      const hits = tokens.filter((t) => low.includes(t)).length;
      if (tokens.length >= 2 && hits === 0) continue;
      // Coca-cola style: no overlap with finance memory
      if (tokens.length >= 3 && hits < 1) continue;
    }
    out.push(e);
  }
  return out;
}

function scoreEvidence(evidenceList) {
  const claims = (evidenceList || []).map((e) => {
    let base = Number(e.raw_score);
    if (Number.isNaN(base)) {
      base =
        e.source_type === 'doc'
          ? 90
          : e.source_type === 'health'
            ? 85
            : e.source_type === 'mem'
              ? 70
              : e.source_type === 'vault'
                ? 65
                : 20;
    }
    return {
      text: String(e.claim_hint || e.snippet || '').slice(0, 300),
      trust: Math.max(0, Math.min(100, base)),
      sources: [`${e.source_type}:${e.source_id || '?'}`],
    };
  });

  if (!claims.length) {
    return {
      overall_trust: 20,
      claims: [],
      confidence_label: 'LOW',
      empty: true,
    };
  }
  const overall = Math.round(claims.reduce((a, c) => a + c.trust, 0) / claims.length);
  return {
    overall_trust: overall,
    claims,
    confidence_label: overall >= 80 ? 'HIGH' : overall >= 60 ? 'MEDIUM' : 'LOW',
    empty: false,
  };
}

async function llmComplete(messages, purpose = 'think') {
  const attempts = [];
  const groqKey = process.env.GROQ_API_KEY || '';
  if (groqKey) {
    attempts.push(async () => {
      const model =
        process.env.THINK_GROQ_MODEL ||
        (process.env.GROQ_MODEL || '').split(',')[0] ||
        'llama-3.3-70b-versatile';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + groqKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: purpose === 'plan' ? 0.15 : 0.25,
          max_tokens: purpose === 'plan' ? 700 : 1100,
        }),
        signal: AbortSignal.timeout(5500),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || 'Groq ' + res.status);
      return {
        text: j.choices?.[0]?.message?.content || '',
        provider: 'groq',
        model,
      };
    });
  }
  const gKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
  if (gKey) {
    attempts.push(async () => {
      const model = process.env.THINK_GEMINI_MODEL || 'gemini-2.0-flash';
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(gKey);
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
    try {
      return await fn();
    } catch (e) {
      last = e.message || String(e);
    }
  }
  throw new Error(last);
}

function heuristicPlan(question, avoidTools = new Set()) {
  const q = String(question).toLowerCase();
  const steps = [];
  const add = (id, tool, args, why) => {
    if (avoidTools.has(tool)) return;
    steps.push({ id, tool, args, why });
  };
  if (/health|system|supabase|vercel|uptime|status|operational/.test(q)) {
    add('s1', 'health_check', {}, 'system');
  }
  if (/doc|document|pdf|profit|budget|report|invoice|contract|summar/.test(q)) {
    add('s2', 'doc_ask', { question }, 'document');
  }
  if (/mem|remember|note|todo|memory/.test(q)) {
    add('s3', 'mem_search', { query: question }, 'memory');
  }
  if (/vault|storage|uploaded/.test(q)) {
    add('s4', 'vault_list', {}, 'vault');
  }
  if (!steps.length) {
    // Unknown / likely no internal evidence — still try doc+mem once
    add('s1', 'doc_ask', { question }, 'probe doc');
    add('s2', 'mem_search', { query: question }, 'probe mem');
  }
  return {
    type: 'plan',
    goal: question,
    steps: steps.slice(0, MAX_TOOLS),
    stop_when: 'enough valid evidence',
  };
}

async function getCache(userId, prompt) {
  const client = sb();
  if (!client) return null;
  const key = cacheKey(userId, prompt);
  try {
    const { data } = await client
      .from('think_cache')
      .select('response, overall_trust, expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.response;
  } catch {
    return null;
  }
}

async function setCache(userId, prompt, envelope) {
  const client = sb();
  if (!client) return;
  const key = cacheKey(userId, prompt);
  const expires = new Date(Date.now() + CACHE_TTL_SEC * 1000).toISOString();
  try {
    await client.from('think_cache').upsert({
      cache_key: key,
      user_id: String(userId),
      prompt_norm: normalizePrompt(prompt),
      response: envelope,
      overall_trust: envelope.overall_trust,
      expires_at: expires,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* optional table */
  }
}

async function saveTrace(row) {
  const client = sb();
  if (!client) return null;
  try {
    const { data } = await client.from('think_traces').insert(row).select('id').maybeSingle();
    return data?.id || null;
  } catch {
    return null;
  }
}

async function logEvidence(traceId, evidenceList) {
  const client = sb();
  if (!client || !evidenceList?.length) return;
  try {
    const rows = evidenceList.slice(0, 30).map((e) => ({
      trace_id: traceId,
      source_type: e.source_type,
      source_id: String(e.source_id || ''),
      snippet: String(e.snippet || e.claim_hint || '').slice(0, 500),
      score: e.raw_score ?? null,
      meta: e,
      created_at: new Date().toISOString(),
    }));
    await client.from('evidence_logs').insert(rows);
  } catch {
    /* optional */
  }
}

async function runPlanSteps(plan, ctx, t0, stepsLog) {
  const toolResults = [];
  const evidence = [];
  const steps = Array.isArray(plan?.steps) ? plan.steps.slice(0, MAX_TOOLS) : [];
  for (const step of steps) {
    if (msSince(t0) >= SOFT_MS) {
      stepsLog.push({ event: 'soft_timeout', at_ms: msSince(t0) });
      break;
    }
    const tool = String(step.tool || '');
    const result = await runTool(tool, step.args || {}, ctx);
    // Strip negative text from evidence at tool boundary too
    const cleanedEv = (result.evidence || []).filter((e) => {
      const t = `${e.claim_hint || ''} ${e.snippet || ''}`;
      return !NEGATIVE_RE.test(t) && e.raw_score !== 0;
    });
    result.evidence = cleanedEv;
    if (cleanedEv.length === 0 && result.data?.answer && NEGATIVE_RE.test(String(result.data.answer))) {
      result.ok = false;
    }
    stepsLog.push({
      step_id: step.id,
      tool,
      ok: result.ok,
      elapsed_ms: result.elapsed_ms,
      error: result.error,
      evidence_n: cleanedEv.length,
    });
    toolResults.push(result);
    evidence.push(...cleanedEv);
  }
  return { toolResults, evidence };
}

export async function runEvidenceThink(question, ctx = {}) {
  const t0 = Date.now();
  const userId = String(ctx.userId || ctx.from?.id || process.env.ADMIN_ID || '');
  const toolCtx = { userId, from: ctx.from };
  const stepsLog = [];
  const providersUsed = [];

  // CACHE
  const cached = await getCache(userId, question);
  if (cached && cached.answer_markdown) {
    const text = String(cached.answer_markdown);
    const withCache = text.includes('cached') ? text : text + '\n\n_(cache hit · 0 LLM)_';
    return {
      text: withCache.slice(0, 3900),
      envelope: { ...cached, cached: true },
    };
  }

  let plan = null;
  let toolResults = [];
  let allEvidence = [];
  let retries = 0;
  let status = 'done';
  let partial = false;

  // PLAN
  try {
    if (msSince(t0) < SOFT_MS - 1500) {
      const planRes = await llmComplete(
        [
          {
            role: 'system',
            content:
              'Return ONLY JSON type=plan with steps[]. Use only catalog tools. No markdown.',
          },
          {
            role: 'user',
            content: `Catalog:\n${toolCatalogForPrompt()}\nMax ${MAX_TOOLS} steps.\nQuestion: ${question}`,
          },
        ],
        'plan'
      );
      providersUsed.push(planRes.provider);
      plan = extractJson(planRes.text);
    }
  } catch (e) {
    stepsLog.push({ event: 'plan_llm_error', error: e.message });
  }
  if (!plan?.steps?.length) {
    plan = heuristicPlan(question);
    stepsLog.push({ event: 'plan_heuristic' });
  }

  // ACT
  let pack = await runPlanSteps(plan, toolCtx, t0, stepsLog);
  toolResults = pack.toolResults;
  allEvidence = filterEvidence(pack.evidence, question);

  // VERIFY
  let verify = scoreEvidence(allEvidence);

  // REFLECT up to 2 times if low trust
  while (
    verify.overall_trust < 60 &&
    retries < MAX_REFLECT &&
    msSince(t0) < SOFT_MS - 2000
  ) {
    retries += 1;
    const used = new Set(toolResults.map((t) => t.tool));
    stepsLog.push({ event: 'reflect', n: retries, trust: verify.overall_trust, used: [...used] });
    const alt = heuristicPlan(question, used);
    // If all tools used, try remaining registry tools
    if (!alt.steps.length) {
      for (const t of ['health_check', 'doc_ask', 'mem_search', 'vault_list']) {
        if (!used.has(t)) {
          alt.steps.push({
            id: 'r' + retries,
            tool: t,
            args: t === 'doc_ask' || t === 'mem_search' ? { question, query: question } : {},
            why: 'reflect',
          });
        }
      }
      alt.steps = alt.steps.slice(0, 2);
    }
    if (!alt.steps.length) break;
    const pack2 = await runPlanSteps(alt, toolCtx, t0, stepsLog);
    toolResults = toolResults.concat(pack2.toolResults);
    allEvidence = filterEvidence(allEvidence.concat(pack2.evidence), question);
    verify = scoreEvidence(allEvidence);
  }

  if (msSince(t0) >= SOFT_MS) {
    partial = true;
    status = 'partial';
  }

  // Empty evidence policy
  let answerText = '';
  if (verify.empty || allEvidence.length === 0) {
    verify = { overall_trust: 20, claims: [], confidence_label: 'LOW', empty: true };
    answerText =
      "**Low Confidence**\n\nI don't know — no evidence found in documents, memories, vault, or system health for this question.";
  } else {
    try {
      if (msSince(t0) < SOFT_MS - 1000) {
        const ans = await llmComplete(
          [
            {
              role: 'system',
              content:
                'Use ONLY tool evidence. Never invent facts. If evidence is weak or off-topic, say you do not know. Match user language.',
            },
            {
              role: 'user',
              content: `Question: ${question}\nTrust: ${verify.overall_trust} ${verify.confidence_label}\nEvidence JSON: ${JSON.stringify(allEvidence).slice(0, 8000)}\nToolResults brief: ${JSON.stringify(toolResults.map((t) => ({ tool: t.tool, ok: t.ok, data: t.data }))).slice(0, 6000)}`,
            },
          ],
          'answer'
        );
        providersUsed.push(ans.provider);
        answerText = ans.text;
      }
    } catch (e) {
      stepsLog.push({ event: 'answer_llm_error', error: e.message });
    }
    if (!answerText) {
      answerText = allEvidence
        .slice(0, 5)
        .map((e, i) => `${i + 1}. (${e.source_type}) ${e.claim_hint || e.snippet}`)
        .join('\n');
    }
    if (verify.overall_trust < 60 && !/low confidence/i.test(answerText)) {
      answerText = '**Low Confidence**\n\n' + answerText;
    }
  }

  if (partial) answerText += '\n\n_(partial — soft time guard)_';

  const sources = [];
  for (const e of allEvidence) {
    const id = `${e.source_type}:${e.source_id || ''}`;
    if (!sources.find((s) => s.id === id)) {
      sources.push({ type: e.source_type, id: e.source_id || '', label: id });
    }
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
    tools_used: toolResults.map((t) => t.tool),
    retries,
    cached: false,
    partial,
  };

  // Only cache solid answers
  if (!partial && verify.overall_trust >= 60 && !verify.empty) {
    await setCache(userId, question, envelope);
  }

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
