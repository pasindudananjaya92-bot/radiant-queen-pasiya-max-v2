/**
 * lib/swarm.js — S5 Omega Swarm (Hive Mind)
 * Free: Supabase JSONB tables only (no extra APIs).
 */

const DEFAULT_AGENTS = [
  { name: 'ui-agent', role: 'ui', skills: ['html', 'css', 'miniapp'] },
  { name: 'backend-agent', role: 'backend', skills: ['api', 'sql', 'vercel'] },
  { name: 'security-agent', role: 'security', skills: ['audit', 'fortress', 'osv'] },
];

export async function ensureDefaultAgents(supabase) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  for (const a of DEFAULT_AGENTS) {
    await supabase.from('rq_swarm_agents').upsert(
      {
        name: a.name,
        role: a.role,
        status: 'idle',
        skills: a.skills,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' }
    );
  }
  return { ok: true };
}

export async function listAgents(supabase) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const { data, error } = await supabase
    .from('rq_swarm_agents')
    .select('name, role, status, skills, last_pattern, updated_at')
    .order('name');
  if (error) return { ok: false, error: error.message };
  return { ok: true, agents: data || [] };
}

export async function spawnAgent(supabase, name, role = 'worker') {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const n = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  if (!n) return { ok: false, error: 'name required' };
  const { data, error } = await supabase
    .from('rq_swarm_agents')
    .upsert(
      {
        name: n,
        role: String(role || 'worker').slice(0, 40),
        status: 'idle',
        skills: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' }
    )
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, agent: data };
}

export async function sharePattern(supabase, { agentName, kind, title, body, tags }) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const row = {
    agent_name: String(agentName || 'founder').slice(0, 40),
    kind: String(kind || 'fix').slice(0, 40),
    title: String(title || body || '')
      .slice(0, 80)
      .replace(/\n/g, ' '),
    body: String(body || '').slice(0, 4000),
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    score: 1,
  };
  if (!row.body.trim()) return { ok: false, error: 'body empty' };
  const { data, error } = await supabase.from('rq_swarm_patterns').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  // bump agent last_pattern
  if (row.agent_name) {
    await supabase
      .from('rq_swarm_agents')
      .update({
        last_pattern: row.title.slice(0, 120),
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('name', row.agent_name);
  }
  return { ok: true, id: data?.id };
}

export async function recallPatterns(supabase, query, limit = 8) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  const q = String(query || '').trim();
  let builder = supabase
    .from('rq_swarm_patterns')
    .select('id, created_at, agent_name, kind, title, body, tags, score')
    .order('created_at', { ascending: false })
    .limit(Math.min(20, limit));
  if (q) {
    // simple ilike search (works without pg_trgm extension dependency for filter)
    builder = builder.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  }
  const { data, error } = await builder;
  if (error) return { ok: false, error: error.message };
  return { ok: true, patterns: data || [] };
}

export function formatSwarmStatus(agents, patterns) {
  const lines = ['🐝 OMEGA SWARM STATUS', ''];
  if (!agents?.length) {
    lines.push('No agents — run /swarm init');
  } else {
    lines.push('Agents (' + agents.length + '):');
    for (const a of agents) {
      lines.push(
        '• ' +
          a.name +
          ' [' +
          a.role +
          '] · ' +
          (a.status || 'idle') +
          (a.last_pattern ? ' · last: ' + String(a.last_pattern).slice(0, 40) : '')
      );
    }
  }
  if (patterns?.length) {
    lines.push('', 'Recent patterns:');
    for (const p of patterns.slice(0, 5)) {
      lines.push('• [' + (p.kind || 'fix') + '] ' + (p.title || p.body || '').slice(0, 60));
    }
  }
  lines.push('', 'Commands: /swarm init|status|recall <q> · /spawn <name> [role] · /share_pattern <text>');
  return lines.join('\n').slice(0, 3500);
}

export default {
  ensureDefaultAgents,
  listAgents,
  spawnAgent,
  sharePattern,
  recallPatterns,
  formatSwarmStatus,
};
