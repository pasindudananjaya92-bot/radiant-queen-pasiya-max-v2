/**
 * Revenue Agent — leads pipeline + AI ideas (founder)
 * /revenue list|idea <t>|add Title | note | 100|won <id>|lost <id>
 */
export async function ensureRevenueTable(supabase) {
  const { error } = await supabase.from('rq_revenue_leads').select('id').limit(1);
  return { ok: !error, error: error?.message };
}

export async function addLead(supabase, { title, note, value }) {
  const row = {
    title: String(title || 'lead').slice(0, 120),
    note: String(note || '').slice(0, 2000),
    value_usd: Number(value) || 0,
    status: 'open',
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('rq_revenue_leads')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id, row };
}

export async function setLeadStatus(supabase, id, status) {
  const st = String(status || '').toLowerCase();
  if (!['open', 'won', 'lost', 'paused'].includes(st)) {
    return { ok: false, error: 'status must be open|won|lost|paused' };
  }
  const { error } = await supabase
    .from('rq_revenue_leads')
    .update({ status: st, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id, status: st };
}

export async function listLeads(supabase, limit = 12) {
  const { data, error } = await supabase
    .from('rq_revenue_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, leads: data || [] };
}

export async function pipelineStats(supabase) {
  const { data, error } = await supabase
    .from('rq_revenue_leads')
    .select('status,value_usd')
    .limit(200);
  if (error) return { ok: false, error: error.message };
  const stats = { open: 0, won: 0, lost: 0, paused: 0, openUsd: 0, wonUsd: 0 };
  for (const r of data || []) {
    const s = r.status || 'open';
    if (stats[s] !== undefined) stats[s]++;
    if (s === 'open') stats.openUsd += Number(r.value_usd) || 0;
    if (s === 'won') stats.wonUsd += Number(r.value_usd) || 0;
  }
  return { ok: true, stats };
}

export async function ideaPitch(topic) {
  const groq = process.env.GROQ_API_KEY || '';
  const prompt =
    'Topic: ' +
    String(topic || 'PasiyaOS Telegram bot OS').slice(0, 400) +
    '\nGive 3 monetization ideas for a founder-only powerful Telegram Mini App OS (free tier: Vercel+Supabase). Bullets, practical, legal.';
  if (!groq) {
    return {
      ok: true,
      text:
        '1) Setup fee for agencies cloning founder bot patterns\n' +
        '2) Private pack of Mini App templates (desktop/phone)\n' +
        '3) Monthly "OS maintain" for one client bot\nTopic: ' +
        topic,
    };
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + groq,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 700,
        temperature: 0.55,
        messages: [
          {
            role: 'system',
            content:
              'Revenue strategist for Telegram bot products. Short bullets only. No scams, no paid ads advice requiring budget.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const j = await res.json();
    return { ok: true, text: j.choices?.[0]?.message?.content || 'No idea' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function formatLeads(r) {
  if (!r.ok) return '❌ ' + r.error + '\nRun sql/REVENUE.sql in Supabase';
  const lines = ['💰 REVENUE LEADS', ''];
  for (const L of r.leads || []) {
    lines.push(
      '• [' +
        String(L.id || '').slice(0, 8) +
        '] ' +
        (L.title || '') +
        ' · $' +
        (L.value_usd || 0) +
        ' · ' +
        (L.status || '') +
        (L.note ? '\n  ' + String(L.note).slice(0, 90) : '')
    );
  }
  if (!(r.leads || []).length) {
    lines.push('(none)');
    lines.push('/revenue add Title | note | 100');
  }
  lines.push('', '/revenue idea <topic> · /revenue won <id> · /revenue stats');
  return lines.join('\n').slice(0, 3500);
}

export function formatStats(r) {
  if (!r.ok) return '❌ ' + r.error;
  const s = r.stats || {};
  return (
    '📊 PIPELINE\n' +
    'open: ' +
    (s.open || 0) +
    ' ($' +
    (s.openUsd || 0) +
    ')\n' +
    'won: ' +
    (s.won || 0) +
    ' ($' +
    (s.wonUsd || 0) +
    ')\n' +
    'lost: ' +
    (s.lost || 0) +
    ' · paused: ' +
    (s.paused || 0)
  );
}

export default {
  addLead,
  listLeads,
  ideaPitch,
  formatLeads,
  formatStats,
  ensureRevenueTable,
  setLeadStatus,
  pipelineStats,
};
