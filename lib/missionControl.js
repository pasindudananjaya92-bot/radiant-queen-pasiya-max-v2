/**
 * Wave 11A — Mission Control kernel
 * Catalog of corps agents + missions/tasks/events (Supabase)
 * Does NOT spawn 200 Node processes — roles are roster entries + jobs.
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function logEvent(missionId, agentCode, eventType, message) {
  const client = sb();
  if (!client || !missionId) return;
  await client.from('rq_mission_events').insert({
    mission_id: missionId,
    agent_code: agentCode || null,
    event_type: eventType || 'info',
    message: String(message || '').slice(0, 2000),
  });
}

export async function listRoster({ corps = null, limit = 50 } = {}) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase', agents: [] };
  let q = client.from('rq_corps_roster').select('*').order('corps').limit(limit);
  if (corps) q = q.eq('corps', corps);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, agents: [] };
  return { ok: true, agents: data || [], count: (data || []).length };
}

export async function nationStatus() {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase not configured' };
  const roster = await listRoster({ limit: 100 });
  const { data: missions } = await client
    .from('rq_missions')
    .select('id, title, status, priority, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  const open = (missions || []).filter((m) => m.status === 'open' || m.status === 'running');
  const byCorps = {};
  for (const a of roster.agents || []) {
    byCorps[a.corps] = byCorps[a.corps] || { active: 0, total: 0 };
    byCorps[a.corps].total += 1;
    if (a.status === 'active') byCorps[a.corps].active += 1;
  }
  return {
    ok: true,
    roster_count: roster.count || 0,
    open_missions: open.length,
    recent_missions: missions || [],
    corps: byCorps,
  };
}

export async function createMission({ title, goal = '', priority = 5, tasks = [] } = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const t = String(title || '').trim();
  if (!t) throw new Error('title required');
  const { data: mission, error } = await client
    .from('rq_missions')
    .insert({
      title: t.slice(0, 200),
      goal: String(goal || t).slice(0, 2000),
      status: 'open',
      priority: Number(priority) || 5,
      created_by: 'founder',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const defaultTasks =
    tasks.length > 0
      ? tasks
      : [
          { corps: 'oracle', title: 'Frame the mission and success criteria' },
          { corps: 'researcher', title: 'Gather evidence from context' },
          { corps: 'critic', title: 'Attack weak claims' },
          { corps: 'executor', title: 'Propose safe executable actions' },
          { corps: 'scribe', title: 'Seal Founder report' },
        ];

  const rows = defaultTasks.map((x) => ({
    mission_id: mission.id,
    corps: String(x.corps || 'researcher').slice(0, 40),
    title: String(x.title || 'task').slice(0, 200),
    status: 'pending',
  }));
  await client.from('rq_mission_tasks').insert(rows);
  await logEvent(mission.id, 'ORACLE-01', 'created', `Mission created: ${t}`);
  return mission;
}

export async function listMissions({ status = null, limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client
    .from('rq_missions')
    .select('id, title, status, priority, created_at, result')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export async function getMission(id) {
  const client = sb();
  if (!client) throw new Error('supabase');
  const { data: mission, error } = await client.from('rq_missions').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  const { data: tasks } = await client
    .from('rq_mission_tasks')
    .select('*')
    .eq('mission_id', id)
    .order('created_at', { ascending: true });
  return { mission, tasks: tasks || [] };
}

/**
 * Run a lightweight mission cycle (Wave 11A):
 * - mark running
 * - execute watchdog/health snapshot into task outputs
 * - mark tasks done with notes
 * - scribe summary onto mission.result
 * Full multi-LLM council = Wave 11B
 */
export async function runMission(id) {
  const client = sb();
  if (!client) throw new Error('supabase');
  const { mission, tasks } = await getMission(id);
  if (!mission) throw new Error('mission not found');
  if (mission.status === 'done') return { ok: true, mission, already: true };

  await client
    .from('rq_missions')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', id);
  await logEvent(id, 'ORACLE-01', 'start', 'Mission running');

  const notes = [];

  // Watchdog: health
  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    let healthText = 'health module present';
    if (typeof fn === 'function') {
      const h = await fn();
      const checks = h.checks || h.results || [];
      if (Array.isArray(checks) && checks.length) {
        healthText = checks
          .slice(0, 10)
          .map((c) => `${c.ok === false ? '❌' : '✅'} ${c.name || c.id}${c.ms != null ? ` ${c.ms}ms` : ''}`)
          .join('\n');
      } else {
        healthText = h.summary || JSON.stringify(h).slice(0, 500);
      }
    }
    notes.push(['watchdog', healthText]);
  } catch (e) {
    notes.push(['watchdog', 'error: ' + (e.message || e)]);
  }

  // Healer hint from alerts
  try {
    const al = await import('./dashboardAlerts.js');
    const r = await al.collectLiveAlerts();
    const list = r.alerts || [];
    notes.push([
      'healer',
      list.length
        ? list
            .slice(0, 5)
            .map((a) => `[${a.severity || a.level}] ${a.title || a.message}`)
            .join('\n')
        : 'No active alerts',
    ]);
  } catch (e) {
    notes.push(['healer', 'alerts unavailable']);
  }

  // Quartermaster bank snapshot
  try {
    const bank = await import('./bankManager.js');
    const sum = await bank.summary(7);
    notes.push([
      'quartermaster',
      `${sum.formatted || sum.total}${sum.total_base_formatted ? ` ≈ ${sum.total_base_formatted}` : ''} (${sum.count} txs)`,
    ]);
  } catch (_) {
    notes.push(['quartermaster', 'bank n/a']);
  }

  // Write into matching tasks or append
  for (const t of tasks) {
    const match = notes.find((n) => n[0] === t.corps || (t.corps === 'watchdog' && n[0] === 'watchdog'));
    const out = match ? match[1] : `Acknowledged task: ${t.title}`;
    await client
      .from('rq_mission_tasks')
      .update({
        status: 'done',
        output: String(out).slice(0, 4000),
        evidence_score: match ? 70 : 40,
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id);
  }

  const report =
    `Mission: ${mission.title}\nGoal: ${mission.goal || '—'}\n\n` +
    notes.map(([k, v]) => `## ${k}\n${v}`).join('\n\n');

  const { data: updated } = await client
    .from('rq_missions')
    .update({
      status: 'done',
      result: report.slice(0, 8000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  await logEvent(id, 'SCRIBE-01', 'done', 'Mission report sealed');
  return { ok: true, mission: updated || mission, report };
}


/**
 * Wave 11B — full Council of 5 LLM debate, persist task outputs
 */
export async function runCouncilMission(id) {
  const client = sb();
  if (!client) throw new Error('supabase');
  const { mission, tasks } = await getMission(id);
  if (!mission) throw new Error('mission not found');

  await client
    .from('rq_missions')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', id);
  await logEvent(id, 'ORACLE-01', 'council_start', 'Council of 5 started');

  const { runCouncilDebate } = await import('./councilEngine.js');
  const debate = await runCouncilDebate({
    title: mission.title,
    goal: mission.goal || mission.title,
    globalBudgetMs: Number(process.env.COUNCIL_BUDGET_MS || 45000),
  });

  // Map turns → tasks by corps
  for (const t of tasks || []) {
    const turn = (debate.turns || []).find((x) => x.corps === t.corps);
    const out = turn
      ? `[${turn.code}] ${turn.provider || ''} ${turn.ms || 0}ms
${turn.text || ''}`
      : `No council turn for corps=${t.corps}`;
    await client
      .from('rq_mission_tasks')
      .update({
        status: turn && turn.ok !== false ? 'done' : 'failed',
        output: String(out).slice(0, 4000),
        evidence_score: turn && turn.ok ? 75 : 30,
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id);
  }

  // Ensure council corps tasks exist even if mission was created in 11A with other corps
  if (!tasks || !tasks.length) {
    for (const turn of debate.turns || []) {
      await client.from('rq_mission_tasks').insert({
        mission_id: id,
        corps: turn.corps,
        title: turn.title || turn.corps,
        status: turn.ok ? 'done' : 'failed',
        output: String(turn.text || '').slice(0, 4000),
        evidence_score: turn.ok ? 75 : 30,
      });
    }
  }

  const result = String(debate.report || '').slice(0, 8000);
  const { data: updated } = await client
    .from('rq_missions')
    .update({
      status: 'done',
      result,
      meta: {
        mode: 'council_5',
        trustHint: debate.trustHint,
        ms: debate.ms,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  await logEvent(id, 'SCRIBE-01', 'council_done', `trust=${debate.trustHint} ms=${debate.ms}`);
  return { ok: true, mission: updated || mission, report: result, debate };
}

export async function bootstrapRoster() {
  // Wave 11F — scale roster (idempotent upserts)
  const client = sb();
  if (!client) return { ok: false };
  const core = [
    ['ORACLE-01', 'oracle', 'Oracle Prime'],
    ['ORACLE-02', 'oracle', 'Oracle Delta'],
    ['ORACLE-03', 'oracle', 'Oracle Horizon'],
    ['RESEARCH-01', 'researcher', 'Lead Researcher'],
    ['RESEARCH-02', 'researcher', 'Deep Scan'],
    ['RESEARCH-03', 'researcher', 'Pattern Miner'],
    ['CRITIC-01', 'critic', 'Red Team'],
    ['CRITIC-02', 'critic', 'Red Team Beta'],
    ['EXEC-01', 'executor', 'Chief Executor'],
    ['EXEC-02', 'executor', 'Ops Runner'],
    ['EXEC-03', 'executor', 'Deploy Hand'],
    ['SCRIBE-01', 'scribe', 'Chief Scribe'],
    ['SCRIBE-02', 'scribe', 'Chronicle'],
    ['HEAL-01', 'healer', 'Chief Healer'],
    ['HEAL-02', 'healer', 'Patchwright'],
    ['HEAL-03', 'healer', 'Immune Node'],
    ['WATCH-01', 'watchdog', 'Watchdog Alpha'],
    ['WATCH-02', 'watchdog', 'Perimeter Eye'],
    ['WATCH-03', 'watchdog', 'Uptime Owl'],
    ['SENTINEL-01', 'sentinel', 'Cyber Sentinel'],
    ['SENTINEL-02', 'sentinel', 'Cipher Guard'],
    ['SENTINEL-03', 'sentinel', 'Leak Hunter'],
    ['AUDITOR-01', 'auditor', 'Ledger Eye'],
    ['AUDITOR-02', 'auditor', 'Route Auditor'],
    ['SCOUT-01', 'scout', 'Pathfinder'],
    ['SCOUT-02', 'scout', 'Signal Scout'],
    ['SCOUT-03', 'scout', 'Web Ranger'],
    ['QUARTER-01', 'quartermaster', 'Quartermaster'],
    ['QUARTER-02', 'quartermaster', 'Vault Keeper'],
    ['ENVOY-01', 'envoy', 'Relay Envoy'],
    ['ENVOY-02', 'envoy', 'Morning Herald'],
    ['BUILD-01', 'builder', 'Scaffold'],
    ['BUILD-02', 'builder', 'Forge'],
  ];
  let n = 0;
  for (const [code, corps, display_name] of core) {
    const { error } = await client.from('rq_corps_roster').upsert(
      { code, corps, display_name, status: 'active' },
      { onConflict: 'code' }
    );
    if (!error) n += 1;
  }
  return { ok: true, upserted: n };
}
