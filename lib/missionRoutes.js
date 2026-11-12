// Wave 11A — Mission Control Telegram commands (strict intercept)

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

/** True if this text belongs to Mission Control (must never hit the LLM) */
export function isMissionControlText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(swarm|nation|corps|mission|missions)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw) return null;
  if (!isMissionControlText(raw)) return null;

  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();

  let mc;
  try {
    mc = await import('./missionControl.js');
  } catch (e) {
    return `❌ missionControl load failed: ${e.message || e}`;
  }

  try {
    // help
    if (
      /^(swarm|mission|missions|nation|corps)\s+help$/i.test(lower) ||
      /^swarm\s*$/i.test(lower) ||
      /^mission\s*$/i.test(lower)
    ) {
      return (
        '*Queen Sovereign · Mission Control (11A)*\n' +
        '• `swarm status` / `nation status` — roster + open missions\n' +
        '• `corps list` — agent catalog\n' +
        '• `mission create <title>`\n' +
        '• `mission list`\n' +
        '• `mission show <id-prefix>`\n' +
        '• `mission run <id-prefix>`\n\n' +
        '_Wave 11A kernel. Council = 11B. Auto-heal = 11C._'
      );
    }

    // nation / swarm status
    if (
      /^(nation|swarm)\s+status$/i.test(lower) ||
      /^swarm\s+nation$/i.test(lower) ||
      /^nation\s*$/i.test(lower)
    ) {
      const st = await mc.nationStatus();
      if (!st.ok) {
        return (
          `❌ Nation status: ${st.error}\n` +
          '_If table missing, run sql/001_mission_control.sql_'
        );
      }
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
    }

    // corps list
    if (/^corps(\s+list)?$/i.test(lower) || /^swarm\s+corps$/i.test(lower)) {
      const r = await mc.listRoster({ limit: 40 });
      if (!r.ok) return `❌ ${r.error}`;
      if (!r.agents?.length) {
        return 'No roster yet. Run SQL `001_mission_control.sql` in Supabase.';
      }
      const lines = r.agents.map(
        (a) => `· \`${a.code}\` *${a.corps}* — ${a.display_name} (${a.status})`
      );
      return `🪖 *Corps roster* (${r.count})\n\n${lines.join('\n')}`;
    }

    // mission create
    const createM = raw.match(/^mission\s+create\s+(.+)$/i);
    if (createM) {
      const title = createM[1].trim();
      const m = await mc.createMission({ title, goal: title });
      return (
        `✅ Mission created\n` +
        `ID: \`${m.id}\`\n` +
        `Title: ${m.title}\n` +
        `Status: ${m.status}\n\n` +
        `Run: \`mission run ${String(m.id).slice(0, 8)}\``
      );
    }

    // mission list
    if (/^mission\s+list$/i.test(lower) || /^missions$/i.test(lower)) {
      const list = await mc.listMissions({ limit: 10 });
      if (!list.length) return 'No missions. Create one: `mission create Night audit`';
      return (
        `📋 *Missions*\n\n` +
        list
          .map((m) => `· \`${String(m.id).slice(0, 8)}\` *${m.status}* ${m.title}`)
          .join('\n')
      );
    }

    // mission show
    const showM = raw.match(/^mission\s+show\s+([a-f0-9-]{6,})$/i);
    if (showM) {
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
        (full.mission.result
          ? `*Result*\n${String(full.mission.result).slice(0, 1500)}`
          : '_No result yet_')
      );
    }

    // mission run
    const runM = raw.match(/^mission\s+run\s+([a-f0-9-]{6,})$/i);
    if (runM) {
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
    }

    // Known family but unknown subcommand — still MUST NOT fall through to AI
    return (
      '❓ Unknown mission command.\n' +
      'Try: `swarm help` · `nation status` · `corps list` · `mission list`'
    );
  } catch (e) {
    return `❌ Mission Control error: ${e.message || e}`;
  }
}

export default { tryHandle, isMissionControlText };
