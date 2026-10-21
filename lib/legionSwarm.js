/**
 * lib/legionSwarm.js — Legion economy on top of rq_swarm_agents
 * credits: +10 fix, +5 find, -3 idle drain optional
 * fire if credits < FIRE_BELOW; spawn replacement
 */
const FIRE_BELOW = 0;
const START_CREDITS = 20;

export async function ensureEconomyColumns(supabase) {
  // Soft: try update; SQL migration separate
  return true;
}

export async function legionStatus(supabase) {
  const { data: agents, error } = await supabase
    .from('rq_swarm_agents')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  const list = (agents || []).map((a) => ({
    name: a.name,
    role: a.role,
    credits: a.credits ?? START_CREDITS,
    status: a.status || 'active',
    fixes: a.fixes || 0,
    finds: a.finds || 0,
  }));
  return { ok: true, agents: list };
}

export async function creditAgent(supabase, name, delta, reason) {
  const { data: row } = await supabase
    .from('rq_swarm_agents')
    .select('*')
    .eq('name', name)
    .maybeSingle();
  if (!row) return { ok: false, error: 'agent not found' };
  const credits = (row.credits ?? START_CREDITS) + delta;
  const patch = {
    credits,
    updated_at: new Date().toISOString(),
  };
  if (delta > 0 && reason === 'fix') patch.fixes = (row.fixes || 0) + 1;
  if (delta > 0 && reason === 'find') patch.finds = (row.finds || 0) + 1;
  if (credits < FIRE_BELOW) patch.status = 'fired';
  const { error } = await supabase.from('rq_swarm_agents').update(patch).eq('name', name);
  if (error) return { ok: false, error: error.message };
  return { ok: true, name, credits, status: patch.status || row.status || 'active' };
}

export async function fireWeak(supabase) {
  const st = await legionStatus(supabase);
  if (!st.ok) return st;
  const fired = [];
  for (const a of st.agents) {
    if ((a.credits ?? 0) < FIRE_BELOW || a.status === 'fired') {
      await supabase
        .from('rq_swarm_agents')
        .update({ status: 'fired', updated_at: new Date().toISOString() })
        .eq('name', a.name);
      fired.push(a.name);
    }
  }
  return { ok: true, fired };
}

export async function spawnLegion(supabase, name, role = 'worker') {
  const row = {
    name,
    role,
    credits: START_CREDITS,
    status: 'active',
    fixes: 0,
    finds: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('rq_swarm_agents').upsert(row, { onConflict: 'name' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, agent: row };
}

export async function legionTick(supabase) {
  // Reward random active agent for "patrol", fire weak, ensure min 3 agents
  const st = await legionStatus(supabase);
  if (!st.ok) return st;
  const active = st.agents.filter((a) => a.status !== 'fired');
  if (active.length) {
    const pick = active[Math.floor(Math.random() * active.length)];
    await creditAgent(supabase, pick.name, 5, 'find');
  }
  const fired = await fireWeak(supabase);
  let spawned = [];
  const st2 = await legionStatus(supabase);
  const alive = (st2.agents || []).filter((a) => a.status !== 'fired');
  while (alive.length + spawned.length < 3) {
    const n = 'legion-' + Math.random().toString(36).slice(2, 7);
    const r = await spawnLegion(supabase, n, 'worker');
    if (r.ok) spawned.push(n);
    else break;
  }
  return {
    ok: true,
    fired: fired.fired || [],
    spawned,
    agents: (await legionStatus(supabase)).agents,
  };
}

export function formatLegion(st) {
  if (!st.ok) return '❌ Legion: ' + st.error;
  const lines = ['⚔ LEGION SWARM ECONOMY', ''];
  for (const a of st.agents || []) {
    lines.push(
      (a.status === 'fired' ? '💀 ' : '🟢 ') +
        a.name +
        ' · ' +
        (a.role || 'worker') +
        ' · ¢' +
        (a.credits ?? 0) +
        ' · fixes=' +
        (a.fixes || 0) +
        ' finds=' +
        (a.finds || 0)
    );
  }
  if (!(st.agents || []).length) lines.push('Empty — /swarm init then /legion tick');
  lines.push('', '¢+10 fix · ¢+5 find · fire if ¢<0 · /legion tick|reward|spawn');
  return lines.join('\n').slice(0, 3500);
}

export default {
  legionStatus,
  creditAgent,
  fireWeak,
  spawnLegion,
  legionTick,
  formatLegion,
};
