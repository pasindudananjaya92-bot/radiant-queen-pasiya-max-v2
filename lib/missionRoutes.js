// Wave 11A — Mission Control Telegram commands

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  const isMissionCmd =
    /^(mission|missions|corps|nation)\b/i.test(lower) ||
    /^swarm\s+(nation|corps|mission|missions|help)\b/i.test(lower) ||
    /^swarm\s+status\b/i.test(lower);

  if (!isMissionCmd) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const mc = await import('./missionControl.js');

  // help
  if (/^(mission|missions|swarm)\s+help$/i.test(lower) || /^nation\s+help$/i.test(lower)) {
    return (
      '*Queen Sovereign · Mission Control (11A)*\n' +
      '• `swarm status` / `nation status` — roster + open missions\n' +
      '• `corps list` — agent catalog\n' +
      '• `mission create <title>`\n' +
      '• `mission list`\n' +
      '• `mission show <id-prefix>`\n' +
      '• `mission run <id-prefix>` — run watchdog/healer/bank cycle\n\n' +
      '_Wave 11A = kernel. Council debate = 11B. Auto-heal = 11C._'
    );
  }

  // nation / swarm status
  if (/^(nation|swarm)\s+status$/i.test(lower) || /^swarm\s+nation$/i.test(lower)) {
    try {
      const st = await mc.nationStatus();
      if (!st.ok) return `❌ ${st.error}`;
      const corpsLines = Object.entries(st.corps || {})
        .map(([k, v]) => `· *${k}*: ${v.active}/${v.total}`)
        .join('\n');
      const miss = (st.recent_missions || [])
        .slice(0, 5)
        .map((m) => `· \`${String(m.id).slice(0, 8)}\` *${m.status}* ${m.title}`)
        .join('\n');
      return (
        `👑 *Nation Status*\n` +
        `Roster: *${st.roster_count}* agents · Open missions: *${st.open_missions}*\n\n` +
        `*Corps*\n${corpsLines || '—'}\n\n` +
        `*Recent missions*\n${miss || 'None yet'}`
      );
    } catch (e) {
      return `❌ ${e.message || e}`;
    }
  }

  // corps list
  if (/^corps\s+list$/i.test(lower) || /^swarm\s+corps$/i.test(lower)) {
    try {
      const r = await mc.listRoster({ limit: 40 });
      if (!r.ok) return `❌ ${r.error}`;
      if (!r.agents?.length) {
        return 'No roster yet. Run SQL `001_mission_control.sql` in Supabase.';
      }
      const lines = r.agents.map(
        (a) => `· \`${a.code}\` *${a.corps}* — ${a.display_name} (${a.status})`
      );
      return `🪖 *Corps roster* (${r.count})\n\n${lines.join('\n')}`;
    } catch (e) {
      return `❌ ${e.message || e}`;
    }
  }

  // mission create
  const createM = raw.match(/^mission\s+create\s+(.+)$/i);
  if (createM) {
    try {
      const title = createM[1].trim();
      const m = await mc.createMission({ title, goal: title });
      return (
        `✅ Mission created\n` +
        `ID: \`${m.id}\`\n` +
        `Title: ${m.title}\n` +
        `Status: ${m.status}\n\n` +
        `Run: \`mission run ${String(m.id).slice(0, 8)}\``
      );
    } catch (e) {
      return `❌ Create failed: ${e.message || e}`;
    }
  }

  // mission list
  if (/^mission\s+list$/i.test(lower) || /^missions$/i.test(lower)) {
    try {
      const list = await mc.listMissions({ limit: 10 });
      if (!list.length) return 'No missions. Create one: `mission create Night audit`';
      return (
        `📋 *Missions*\n\n` +
        list
          .map((m) => `· \`${String(m.id).slice(0, 8)}\` *${m.status}* ${m.title}`)
          .join('\n')
      );
    } catch (e) {
      return `❌ ${e.message || e}`;
    }
  }

  // mission show
  const showM = raw.match(/^mission\s+show\s+([a-f0-9-]{6,})$/i);
  if (showM) {
    try {
      const prefix = showM[1].toLowerCase();
      const list = await mc.listMissions({ limit: 20 });
      const hit = list.find((m) => String(m.id).toLowerCase().startsWith(prefix));
      if (!hit) return 'Mission not found';
      const full = await mc.getMission(hit.id);
      const tasks = (full.tasks || [])
        .map((t) => `· [${t.status}] *${t.corps}*: ${t.title}`)
        .join('\n');
      return (
        `📋 *${full.mission.title}*\n` +
        `Status: *${full.mission.status}*\n` +
        `ID: \`${full.mission.id}\`\n\n` +
        `*Tasks*\n${tasks}\n\n` +
        (full.mission.result ? `*Result*\n${String(full.mission.result).slice(0, 1500)}` : '_No result yet_')
      );
    } catch (e) {
      return `❌ ${e.message || e}`;
    }
  }

  // mission run
  const runM = raw.match(/^mission\s+run\s+([a-f0-9-]{6,})$/i);
  if (runM) {
    try {
      const prefix = runM[1].toLowerCase();
      const list = await mc.listMissions({ limit: 30 });
      const hit = list.find((m) => String(m.id).toLowerCase().startsWith(prefix));
      if (!hit) return 'Mission not found';
      const r = await mc.runMission(hit.id);
      return (
        `✅ Mission *${r.mission?.status || 'done'}*\n` +
        `\`${hit.id}\`\n\n` +
        String(r.report || r.mission?.result || '').slice(0, 2800)
      );
    } catch (e) {
      return `❌ Run failed: ${e.message || e}`;
    }
  }

  return null;
}

export default { tryHandle };
