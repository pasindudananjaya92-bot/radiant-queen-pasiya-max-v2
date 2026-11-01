/**
 * Agent-20 · Make.com Routes
 * Natural-language + command handler. Returns string | null.
 * Founder gate is applied by agentExecute.
 */

import * as make from './makeManager.js';

const HELP = `⚙️ *Make.com Manager (Agent-20)*

*Commands*
\`make list\` / \`make ls\` — list scenarios
\`make status <id|name>\` — scenario details
\`make run <id|name>\` — execute once (on-demand)
\`make start <id|name>\` — activate scheduling
\`make stop <id|name>\` — deactivate scheduling
\`make hooks\` / \`make webhooks\` — list webhooks
\`make teams\` — list teams (debug)
\`make help\`

*Natural language*
• "make list"
• "run make scenario 12345"
• "stop the invoice scenario"
• "show make webhooks"

*Env required*
MAKE_API_KEY · MAKE_TEAM_ID
Optional: MAKE_ZONE (eu1/us1/us2/eu2)`;

function clean(t) {
  return String(t || '').trim();
}

export async function tryHandle(text) {
  const raw = clean(text);
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const isMake =
    /^(make|make\.com|integromat)\b/i.test(raw) ||
    /\b(make\s+list|make\s+status|make\s+run|make\s+start|make\s+stop|make\s+hooks|make\s+webhooks)\b/i.test(
      lower
    );

  if (!isMake && !/^(list|status|run|start|stop)\s+scenario/i.test(lower)) {
    return null;
  }

  try {
    if (/^(make\s+)?help\b/i.test(lower) || lower === 'make') {
      return HELP;
    }

    // list
    if (
      /^(make\s+)?(list|ls|scenarios)\b/i.test(lower) ||
      /make\s+list/i.test(lower)
    ) {
      const data = await make.listScenarios({ limit: 50 });
      return make.formatList(data);
    }

    // hooks
    if (/^(make\s+)?(hooks|webhooks)\b/i.test(lower)) {
      const data = await make.listHooks({ limit: 50 });
      return make.formatHooks(data);
    }

    // teams (debug)
    if (/^(make\s+)?teams\b/i.test(lower)) {
      const data = await make.listTeams();
      const teams = data.teams || data || [];
      const lines = ['👥 *Make Teams*', ''];
      for (const t of Array.isArray(teams) ? teams.slice(0, 20) : []) {
        lines.push(`• ${t.name || t.id} — \`${t.id}\``);
      }
      if (lines.length === 2) lines.push('_none_');
      return lines.join('\n');
    }

    // status
    let m =
      lower.match(/^(?:make\s+)?status\s+(.+)$/i) ||
      lower.match(/\bstatus\s+(?:of\s+)?(?:scenario\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const s = await make.findScenario(target);
      if (!s) return `❌ Scenario not found: \`${target}\`\nTry \`make list\``;
      return make.formatStatus(s);
    }

    // run
    m =
      lower.match(/^(?:make\s+)?run\s+(.+)$/i) ||
      lower.match(/\brun\s+(?:make\s+)?(?:scenario\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const s = await make.findScenario(target);
      if (!s) return `❌ Scenario not found: \`${target}\``;
      const id = s.id || s.scenarioId;
      const res = await make.runScenario(id);
      return [
        `▶️ *Run triggered*`,
        `Scenario: *${s.name || id}* (\`${id}\`)`,
        res.executionId ? `Execution: \`${res.executionId}\`` : '',
        res.status ? `Status: ${res.status}` : '',
        '',
        '_Check Make History for full log._',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // start (activate)
    m =
      lower.match(/^(?:make\s+)?start\s+(.+)$/i) ||
      lower.match(/\bactivate\s+(?:scenario\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const s = await make.findScenario(target);
      if (!s) return `❌ Scenario not found: \`${target}\``;
      await make.startScenario(s.id);
      return `🟢 *Activated* · ${s.name || s.id}\nScheduling is now ON.`;
    }

    // stop (deactivate)
    m =
      lower.match(/^(?:make\s+)?stop\s+(.+)$/i) ||
      lower.match(/\bdeactivate\s+(?:scenario\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const s = await make.findScenario(target);
      if (!s) return `❌ Scenario not found: \`${target}\``;
      await make.stopScenario(s.id);
      return `⏸ *Deactivated* · ${s.name || s.id}\nScheduling is now OFF.`;
    }

    if (/^make\b/i.test(raw)) return HELP;
    return null;
  } catch (err) {
    const status = err.status || '';
    let extra = '';
    if (status === 401) extra = '\n🔑 Check MAKE_API_KEY (token revoked?).';
    if (status === 403) extra = '\n🔒 Missing scope — recreate token with scenarios:read + scenarios:run + scenarios:write + hooks:read.';
    if (status === 404) extra = '\n❓ Wrong zone or team? Set MAKE_ZONE / MAKE_TEAM_ID.';
    return `❌ Make.com error${status ? ` (${status})` : ''}\n${err.message}${extra}`;
  }
}

export default { tryHandle, HELP };
