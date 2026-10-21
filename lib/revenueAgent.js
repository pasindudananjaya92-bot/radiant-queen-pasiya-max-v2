/**
 * /revenue — lite revenue agent (ideas + leads log in Supabase)
 */
export async function ensureRevenueTable(supabase) {
  // table created via SQL file; soft check
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
  const { data, error } = await supabase.from('rq_revenue_leads').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id, row };
}

export async function listLeads(supabase, limit = 10) {
  const { data, error } = await supabase
    .from('rq_revenue_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, leads: data || [] };
}

export async function ideaPitch(topic) {
  const groq = process.env.GROQ_API_KEY || '';
  if (!groq) {
    return {
      ok: true,
      text:
        'Idea (offline): Package PasiyaOS as founder-only Telegram OS license + setup service for agencies. Topic: ' +
        topic,
    };
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + groq,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: 600,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content:
            'You are a revenue agent for a powerful Telegram bot OS. Give 3 practical monetization ideas. Short bullets. Free-tier friendly. No illegal advice.',
        },
        { role: 'user', content: String(topic || 'Telegram bot product').slice(0, 500) },
      ],
    }),
  });
  const j = await res.json();
  return { ok: true, text: j.choices?.[0]?.message?.content || 'No idea' };
}

export function formatLeads(r) {
  if (!r.ok) return '❌ ' + r.error + '\nRun sql/REVENUE.sql';
  const lines = ['💰 REVENUE LEADS', ''];
  for (const L of r.leads || []) {
    lines.push(
      '• ' +
        (L.title || '') +
        ' · $' +
        (L.value_usd || 0) +
        ' · ' +
        (L.status || '') +
        (L.note ? '\n  ' + String(L.note).slice(0, 80) : '')
    );
  }
  if (!(r.leads || []).length) lines.push('(none) — /revenue add Title | note | 100');
  return lines.join('\n').slice(0, 3500);
}

export default { addLead, listLeads, ideaPitch, formatLeads, ensureRevenueTable };
