/**
 * Wave 11E — War Room aggregate (Dashboard + optional TG)
 * Parallel, read-mostly; heal/sentinel actions are explicit POSTs from UI.
 */

export async function getWarRoomOverview() {
  const t0 = Date.now();
  const out = {
    ok: true,
    threat: 'green',
    nation: null,
    missions: [],
    heals: [],
    sentinel: null,
    health: null,
    ms: 0,
  };

  const tasks = await Promise.allSettled([
    (async () => {
      const mc = await import('./missionControl.js');
      return mc.nationStatus();
    })(),
    (async () => {
      const mc = await import('./missionControl.js');
      return mc.listMissions({ limit: 8 });
    })(),
    (async () => {
      try {
        const h = await import('./healerEngine.js');
        return h.recentHealLog(6);
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const s = await import('./sentinelEngine.js');
        // lightweight: last log only; full scan is separate action
        const logs = await s.recentSentinelLog(1);
        return logs[0] || null;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const hm = await import('./healthManager.js');
        const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
        if (typeof fn !== 'function') return null;
        return fn();
      } catch {
        return null;
      }
    })(),
  ]);

  if (tasks[0].status === 'fulfilled') out.nation = tasks[0].value;
  if (tasks[1].status === 'fulfilled') out.missions = tasks[1].value || [];
  if (tasks[2].status === 'fulfilled') out.heals = tasks[2].value || [];
  if (tasks[3].status === 'fulfilled') out.sentinel = tasks[3].value;
  if (tasks[4].status === 'fulfilled') out.health = tasks[4].value;

  // Threat level
  let threat = 'green';
  const checks = out.health?.checks || out.health?.results || [];
  const down = (checks || []).filter((c) => c && c.ok === false).length;
  if (down > 0) threat = 'red';
  else if ((out.nation?.open_missions || 0) > 3) threat = 'yellow';
  else if (out.sentinel && (out.sentinel.severity === 'critical' || out.sentinel.severity === 'warn')) {
    threat = out.sentinel.severity === 'critical' ? 'red' : 'yellow';
  }
  out.threat = threat;
  out.ms = Date.now() - t0;
  return out;
}

export default { getWarRoomOverview };
