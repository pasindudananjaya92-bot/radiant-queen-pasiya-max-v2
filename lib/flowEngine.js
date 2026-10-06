/**
 * lib/flowEngine.js — text workflow engine (free tier)
 * Steps: text | ai | http | delay_meta | notify
 * Durable waits → store run + cron (no Inngest required)
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseFlowSpec(text) {
  // lines: STEP type: payload
  const steps = [];
  for (const line of String(text || '').split(/\n/)) {
    const m = line.trim().match(/^(ai|text|http|notify)\s*:\s*(.+)$/i);
    if (m) steps.push({ type: m[1].toLowerCase(), payload: m[2].trim() });
  }
  return steps;
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
  }
  // always mirror settings
  if (client) {
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
    .limit(30);
  const flows = [];
  for (const r of data || []) {
    try {
      const j = JSON.parse(r.value);
      if (!userId || j.user_id === String(userId)) flows.push(j);
    } catch (_) {}
  }
  return { ok: true, flows };
}

export async function runFlowSteps(steps, generateReply, ctx) {
  const logs = [];
  let last = '';
  for (const step of (steps || []).slice(0, 8)) {
    if (step.type === 'text') {
      last = step.payload;
      logs.push({ type: 'text', out: last.slice(0, 200) });
    } else if (step.type === 'ai') {
      const prompt = step.payload.replace(/\{\{input\}\}/g, last);
      last = String(await generateReply(prompt, ctx) || '');
      logs.push({ type: 'ai', out: last.slice(0, 200) });
    } else if (step.type === 'http') {
      try {
        const res = await fetch(step.payload, { signal: AbortSignal.timeout(12000) });
        last = 'HTTP ' + res.status;
        logs.push({ type: 'http', out: last });
      } catch (e) {
        logs.push({ type: 'http', out: 'err ' + e.message });
      }
    } else if (step.type === 'notify') {
      logs.push({ type: 'notify', out: step.payload.slice(0, 200) });
    }
  }
  return { ok: true, logs, last };
}

export default { parseFlowSpec, saveFlow, listFlows, runFlowSteps };
