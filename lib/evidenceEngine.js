// lib/evidenceEngine.js
// Agent-27 Phase 1 — Evidence Engine
// Think → Plan → Act → Verify → (Reflect x1) → Answer
// Groq → Gemini | tools: registry | 8s soft guard | max 4 tools

import { createClient } from '@supabase/supabase-js';
import { runTool, toolCatalogForPrompt } from './toolRegistry.js';

const SOFT_MS = 8000;
const MAX_TOOLS = 4;
const MAX_REFLECT = 1;

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function msSince(t0) {
  return Date.now() - t0;
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
          temperature: purpose === 'plan' ? 0.15 : 0.3,
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
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      const user = messages
        .filter((m) => m.role !== 'system')
        .map((m) => m.content)
        .join('\n');
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 1100 },
        }),
        signal: AbortSignal.timeout(5500),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || 'Gemini ' + res.status);
      const text =
        j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return { text, provider: 'gemini', model };
    });
  }

  let last = 'No LLM (set GROQ_API_KEY or GEMINI_API_KEY)';
  for (const fn of attempts) {
    try {
      return await fn();
    } catch (e) {
      last = e.message || String(e);
    }
  }
  throw new Error(last);
}

function heuristicPlan(question) {
  const q = String(question).toLowerCase();
  const steps = [];
  if (/health|system|supabase|vercel|uptime|status|operational/.test(q)) {
    steps.push({ id: 's1', tool: 'health_check', args: {}, why: 'system' });
  }
  if (/doc|document|pdf|profit|budget|report|invoice|contract|summar/.test(q)) {
    steps.push({ id: 's2', tool: 'doc_ask', args: { question }, why: 'document' });
  }
  if (/mem|remember|note|todo|memory/.test(q)) {
    steps.push({ id: 's3', tool: 'mem_search', args: { query: question }, why: 'memory' });
  }
  if (/vault|storage|uploaded/.test(q)) {
    steps.push({ id: 's4', tool: 'vault_list', args: {}, why: 'vault' });
  }
  if (!steps.length) {
    steps.push({ id: 's1', tool: 'doc_ask', args: { question }, why: 'default doc' });
    steps.push({ id: 's2', tool: 'mem_search', args: { query: question }, why: 'default mem' });
  }
  return {
    type: 'plan',
    goal: question,
    steps: steps.slice(0, MAX_TOOLS),
    stop_when: 'enough evidence or tools exhausted',
  };
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
                : 40;
    }
    return {
      text: String(e.claim_hint || e.snippet || '').slice(0, 300),
      trust: Math.max(0, Math.min(100, base)),
      sources: [`${e.source_type}:${e.source_id || '?'}`],
    };
  });
  if (!claims.length) {
    return { overall_trust: 25, claims: [], confidence_label: 'LOW' };
  }
  const overall = Math.round(claims.reduce((a, c) => a + c.trust, 0) / claims.length);
  return {
    overall_trust: overall,
    claims,
    confidence_label: overall >= 80 ? 'HIGH' : overall >= 60 ? 'MEDIUM' : 'LOW',
  };
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
    const args = step.args || {};
    const result = await runTool(tool, args, ctx);
    stepsLog.push({
      step_id: step.id,
      tool,
      ok: result.ok,
      elapsed_ms: result.elapsed_ms,
      error: result.error,
    });
    toolResults.push(result);
    if (Array.isArray(result.evidence)) evidence.push(...result.evidence);
  }
  return { toolResults, evidence };
}

export async function runEvidenceThink(question, ctx = {}) {
  const t0 = Date.now();
  const userId = String(ctx.userId || ctx.from?.id || process.env.ADMIN_ID || '');
  const toolCtx = { userId, from: ctx.from };
  const stepsLog = [];
  const providersUsed = [];
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
              'Return ONLY a JSON object with type=plan and steps[]. Tools must be from the catalog. No markdown.',
          },
          {
            role: 'user',
            content: `Catalog:\n${toolCatalogForPrompt()}\n\nMax ${MAX_TOOLS} steps.\nQuestion: ${question}`,
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
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
    plan = heuristicPlan(question);
    stepsLog.push({ event: 'plan_heuristic' });
  }

  // ACT
  let pack = await runPlanSteps(plan, toolCtx, t0, stepsLog);
  toolResults = pack.toolResults;
  allEvidence = pack.evidence;

  // VERIFY
  let verify = scoreEvidence(allEvidence);

  // REFLECT once if low trust and time remains
  if (
    verify.overall_trust < 60 &&
    retries < MAX_REFLECT &&
    msSince(t0) < SOFT_MS - 2000
  ) {
    retries += 1;
    stepsLog.push({ event: 'reflect', trust: verify.overall_trust });
    const used = new Set(toolResults.map((t) => t.tool));
    const alt = heuristicPlan(question);
    alt.steps = (alt.steps || []).filter((s) => !used.has(s.tool)).slice(0, 2);
    if (alt.steps.length) {
      const pack2 = await runPlanSteps(alt, toolCtx, t0, stepsLog);
      toolResults = toolResults.concat(pack2.toolResults);
      allEvidence = allEvidence.concat(pack2.evidence);
      verify = scoreEvidence(allEvidence);
    }
  }

  if (msSince(t0) >= SOFT_MS) {
    partial = true;
    status = 'partial';
  }

  // ANSWER
  let answerText = '';
  try {
    if (msSince(t0) < SOFT_MS - 1000 && toolResults.length) {
      const ans = await llmComplete(
        [
          {
            role: 'system',
            content:
              'Answer using ONLY tool evidence. If weak, say Low Confidence. Be concise. Match user language (Sinhala/English).',
          },
          {
            role: 'user',
            content: `Question: ${question}\nTrust: ${verify.overall_trust} ${verify.confidence_label}\nResults: ${JSON.stringify(toolResults).slice(0, 10000)}`,
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
    // Deterministic fallback from evidence
    const lines = allEvidence.slice(0, 6).map((e, i) => `${i + 1}. (${e.source_type}) ${e.claim_hint || e.snippet}`);
    answerText = lines.length
      ? (verify.overall_trust < 60 ? '**Low Confidence**\n\n' : '') +
        'Evidence gathered:\n' +
        lines.join('\n')
      : '**Low Confidence**\n\nI could not gather enough evidence from doc/mem/health/vault within the time limit.';
    if (partial) answerText += '\n\n_(partial — soft time guard)_';
  }

  if (verify.overall_trust < 60 && !/low confidence/i.test(answerText)) {
    answerText = '**Low Confidence**\n\n' + answerText;
  }

  const sources = [];
  for (const e of allEvidence) {
    const id = `${e.source_type}:${e.source_id || ''}`;
    if (!sources.find((s) => s.id === id)) {
      sources.push({ type: e.source_type, id: e.source_id || '', label: id });
    }
  }

  const footer =
    `\n\n——\nTrust: ${verify.overall_trust}/100 (${verify.confidence_label}) · tools: ${toolResults.map((t) => t.tool).join(', ') || 'none'} · ${msSince(t0)}ms` +
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

  await saveTrace({
    user_id: userId,
    prompt: String(question).slice(0, 4000),
    status,
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

  return { text: finalText, envelope };
}

export default { runEvidenceThink };
