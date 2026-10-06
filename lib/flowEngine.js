/**
 * lib/flowEngine.js — data-aware workflow runner
 * AI steps TRANSFORM previous output (never advisory chat)
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseFlowSpec(text) {
  const { extractFlowSteps } = requireFlowAI();
  return extractFlowSteps(text);
}

function requireFlowAI() {
  // dynamic-safe for both CJS interop in mental model — use sync import pattern via global
  return {
    extractFlowSteps: (t) => {
      // inline minimal parse to avoid circular; prefer extractFlowSteps from flowAI at call sites
      const raw = String(t || '');
      const steps = [];
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const arr = JSON.parse(jsonMatch[0]);
          for (const item of arr) {
            const type = String(item?.type || '').toLowerCase();
            if (!['http', 'ai', 'text', 'notify'].includes(type)) continue;
            const payload = String(item.payload ?? item.url ?? item.prompt ?? '').trim();
            if (payload) steps.push({ type, payload });
          }
        } catch (_) {}
      }
      if (steps.length) return steps;
      for (const line of raw.split(/\n/)) {
        const m = line.trim().match(/^(ai|text|http|notify)\s*[:：]\s*(.+)$/i);
        if (m) steps.push({ type: m[1].toLowerCase(), payload: m[2].trim() });
      }
      return steps;
    },
  };
}

export async function saveFlow(userId, name, steps, raw) {
  const client = sb();
  const id = Date.now().toString(36);
  const row = {
    id,
    user_id: String(userId),
    name: String(name || 'flow').slice(0, 80),
    steps,
    raw: String(raw || '').slice(0, 8000),
    enabled: true,
    created_at: new Date().toISOString(),
  };
  if (client) {
    try {
      await client.from('rq_flows').upsert(row);
    } catch (_) {}
    await client.from('rq_bot_settings').upsert({
      key: 'flow_' + id,
      value: JSON.stringify(row),
      updated_at: new Date().toISOString(),
    });
  }
  return { ok: true, id, name: row.name, steps: steps.length };
}

export async function listFlows(userId) {
  const client = sb();
  if (!client) return { ok: true, flows: [] };
  const { data } = await client
    .from('rq_bot_settings')
    .select('key,value')
    .like('key', 'flow_%')
    .limit(40);
  const flows = [];
  for (const r of data || []) {
    try {
      const j = JSON.parse(r.value);
      if (!userId || j.user_id === String(userId)) flows.push(j);
    } catch (_) {}
  }
  return { ok: true, flows };
}

/** Expand HN topstories JSON into item titles via multi-fetch */
async function enrichHttpData(url, bodyText) {
  const u = String(url || '');
  const text = String(bodyText || '');
  // Hacker News topstories → fetch first 5 items
  if (/hacker-news\.firebaseio\.com\/v0\/topstories/i.test(u)) {
    try {
      const ids = JSON.parse(text);
      if (Array.isArray(ids)) {
        const top = ids.slice(0, 5);
        const items = [];
        for (const id of top) {
          try {
            const r = await fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', {
              signal: AbortSignal.timeout(8000),
            });
            const j = await r.json();
            if (j?.title) items.push((items.length + 1) + '. ' + j.title + (j.url ? ' — ' + j.url : ''));
          } catch (_) {}
        }
        if (items.length) return items.join('\n');
      }
    } catch (_) {}
  }
  return text.slice(0, 12000);
}

function aiTransformPrompt(userPayload, previousOutput) {
  return (
    'You are a DATA TRANSFORMER inside an automation pipeline.\n' +
    'Rules:\n' +
    '- Process the INPUT data below.\n' +
    '- Output ONLY the transformed result (titles, lists, summaries of the data).\n' +
    '- NEVER give instructions, tutorials, or ask for more information.\n' +
    '- NEVER reply in a conversational helper tone.\n' +
    '- If INPUT is JSON IDs from Hacker News, output a numbered list of titles and urls if present in input; if only IDs, list the IDs clearly as data.\n' +
    '- Match language of the step instruction only for the output content, not for meta-advice.\n\n' +
    'STEP INSTRUCTION:\n' +
    String(userPayload || 'Summarize INPUT').slice(0, 500) +
    '\n\nINPUT (from previous step):\n' +
    String(previousOutput || '(empty)').slice(0, 8000) +
    '\n\nOUTPUT DATA ONLY:'
  );
}

export async function runFlowSteps(steps, generateReply, ctx) {
  const logs = [];
  let last = '';
  for (const step of (steps || []).slice(0, 8)) {
    if (step.type === 'text') {
      last = String(step.payload || '').replace(/\{\{input\}\}/g, last);
      logs.push({ type: 'text', out: last.slice(0, 300) });
    } else if (step.type === 'http') {
      const url = String(step.payload || '').replace(/\{\{input\}\}/g, last).trim();
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'RadiantQueenFlow/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const body = await res.text();
        last = await enrichHttpData(url, body);
        logs.push({ type: 'http', out: ('HTTP ' + res.status + ' · ' + last.slice(0, 240)).slice(0, 280) });
      } catch (e) {
        last = 'HTTP_ERROR ' + String(e.message || e);
        logs.push({ type: 'http', out: last });
      }
    } else if (step.type === 'ai') {
      const instruction = String(step.payload || '').replace(/\{\{input\}\}/g, last);
      const prompt = aiTransformPrompt(instruction, last);
      const out = String((await generateReply(prompt, ctx)) || '').trim();
      // reject advisory-only outputs: if looks like instructions and no data, retry harder
      const advisory =
        /කරුණාකර|please provide|මෙහෙම කරන්න|follow these steps|instructions:/i.test(out) &&
        out.length < 400;
      if (advisory) {
        const retry = await generateReply(
          'DATA ONLY. No advice.\nINPUT:\n' + last.slice(0, 6000) + '\n\nTask: ' + instruction.slice(0, 300),
          ctx
        );
        last = String(retry || out);
      } else {
        last = out;
      }
      logs.push({ type: 'ai', out: last.slice(0, 300) });
    } else if (step.type === 'notify') {
      const msg = String(step.payload || 'done').replace(/\{\{input\}\}/g, last);
      logs.push({ type: 'notify', out: (msg + '\n---\n' + last).slice(0, 400) });
      last = msg;
    }
  }
  return { ok: true, logs, last };
}

export default { parseFlowSpec, saveFlow, listFlows, runFlowSteps };
