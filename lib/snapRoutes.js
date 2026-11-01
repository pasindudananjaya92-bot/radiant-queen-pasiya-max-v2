/**
 * Agent-19 · SnapDeploy Routes
 * Natural-language + slash-style command handler.
 * Returns a plain string (Telegram-safe). Never throws to caller.
 *
 * Founder-only gate is applied by the caller (agentExecute).
 */

import * as snap from './snapDeployManager.js';

const HELP = `📦 *SnapDeploy Manager (Agent-19)*

*Commands*
\`snap list\` / \`snap ls\` — all containers + quota
\`snap status <name|id>\` — detailed status
\`snap logs <name|id> [lines]\` — runtime logs
\`snap restart <name|id>\` — restart container
\`snap wake <name|id>\` — wake sleeping free-tier app
\`snap start <name|id>\` · \`snap stop <name|id>\`
\`snap heal <name|id>\` — wake → restart → status + logs
\`snap heal <name|id> --redeploy\` — also force redeploy
\`snap deploy <owner/repo> [name] [branch]\` — create + build
\`snap quota\` — deploy-cap + hours
\`snap help\`

*Natural language also works*
• "snap list"
• "restart strideclub"
• "heal the strideclub container"
• "wake stride club"
• "show snapdeploy logs for my-app"
• "deploy myuser/myrepo as new-site"

⚠️ Tokens cannot delete containers (SnapDeploy safety).`;

function clean(text) {
  return String(text || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

/**
 * tryHandle(text) → string | null
 * Returns reply string if handled, null if not a snap command.
 */
export async function tryHandle(text) {
  const raw = clean(text);
  if (!raw) return null;

  const lower = raw.toLowerCase();

  // quick reject for unrelated messages
  const isSnap =
    /^(snap|snapdeploy|sd)\b/i.test(raw) ||
    /\b(snapdeploy|snap\s+list|snap\s+status|snap\s+logs|snap\s+heal|snap\s+restart|snap\s+wake|snap\s+deploy|snap\s+quota)\b/i.test(
      lower
    ) ||
    /\b(restart|wake|heal)\s+(the\s+)?[\w-]+(\s+container)?\b/i.test(lower) ||
    /\b(show|get|fetch)\s+(snap|snapdeploy)?\s*logs?\b/i.test(lower);

  if (!isSnap && !/^(list|status|logs|restart|wake|heal|deploy|quota)\b/i.test(lower)) {
    // still allow very short "heal strideclub" style
    if (!/\b(heal|restart|wake)\s+[\w-]{2,}/i.test(lower)) return null;
  }

  try {
    // ---- help ----
    if (/^(snap\s+)?help\b/i.test(lower) || lower === 'snap') {
      return HELP;
    }

    // ---- list / ls ----
    if (
      /^(snap\s+)?(list|ls|containers|apps)\b/i.test(lower) ||
      /snapdeploy\s+list/i.test(lower) ||
      lower === 'snap list' ||
      lower === 'snap ls'
    ) {
      const data = await snap.listApps();
      return snap.formatList(data);
    }

    // ---- quota ----
    if (/^(snap\s+)?quota\b/i.test(lower) || /deploy[- ]?cap/i.test(lower)) {
      const [cap, boot] = await Promise.all([
        snap.getDeployCap().catch(() => null),
        snap.bootstrap().catch(() => null),
      ]);
      const lines = ['📊 *SnapDeploy Quota*'];
      if (cap) {
        lines.push(
          `Deploy remaining: *${cap.remaining ?? '?'}* / ${cap.dailyLimit ?? '?'}`,
          cap.timeUntilReset ? `Resets in: ${cap.timeUntilReset}` : '',
          `Capped: ${cap.capped ? 'yes' : 'no'}`
        );
      }
      if (boot?.usage) {
        lines.push(
          '',
          `Hours used: ${boot.usage.hoursUsed?.toFixed?.(1) ?? boot.usage.hoursUsed} / ${boot.usage.hoursLimit}`,
          `Remaining hours: ${boot.usage.remainingHours?.toFixed?.(1) ?? boot.usage.remainingHours}`
        );
      }
      if (boot?.user?.plan) lines.push(`Plan: \`${boot.user.plan}\``);
      return lines.filter(Boolean).join('\n');
    }

    // ---- status ----
    let m = lower.match(/^(?:snap\s+)?status\s+(.+)$/i) ||
            lower.match(/\bstatus\s+(?:of\s+)?(?:the\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const c = await snap.findContainer(target);
      if (!c) return `❌ Container not found: \`${target}\`\nTry \`snap list\``;
      const full = await snap.getContainer(c.containerId).catch(() => c);
      return snap.formatStatus(full);
    }

    // ---- logs ----
    m = lower.match(/^(?:snap\s+)?logs?\s+([a-z0-9._-]+)(?:\s+(\d+))?/i) ||
        lower.match(/(?:show|get|fetch)\s+(?:snap(?:deploy)?\s+)?logs?\s+(?:for\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const lines = m[2] ? parseInt(m[2], 10) : 120;
      const c = await snap.findContainer(target);
      if (!c) return `❌ Container not found: \`${target}\``;
      const logs = await snap.getLogs(c.containerId, lines);
      let body = '';
      if (typeof logs === 'string') body = logs;
      else if (Array.isArray(logs)) body = logs.join('\n');
      else if (logs.lines) body = Array.isArray(logs.lines) ? logs.lines.join('\n') : String(logs.lines);
      else if (logs.log) body = String(logs.log);
      else body = JSON.stringify(logs, null, 2);
      body = body.slice(-3500);
      return `📜 *Logs · ${c.name}*\n\`\`\`\n${body || '(empty)'}\n\`\`\``;
    }

    // ---- restart ----
    m = lower.match(/^(?:snap\s+)?restart\s+([a-z0-9._-]+)/i) ||
        lower.match(/\brestart\s+(?:the\s+)?([a-z0-9._-]+)(?:\s+container)?/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const c = await snap.findContainer(target);
      if (!c) return `❌ Container not found: \`${target}\``;
      await snap.restartContainer(c.containerId);
      return `🔄 Restart triggered for *${c.name}*\n\`${c.containerId}\`\n${c.url || ''}`;
    }

    // ---- wake ----
    m = lower.match(/^(?:snap\s+)?wake\s+([a-z0-9._-]+)/i) ||
        lower.match(/\bwake\s+(?:the\s+)?([a-z0-9._-]+)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const c = await snap.findContainer(target);
      if (!c) return `❌ Container not found: \`${target}\``;
      await snap.wakeContainer(c.containerId);
      return `☀️ Wake sent to *${c.name}*\n${c.url || ''}\n(Free-tier apps take ~30-60s to become ready)`;
    }

    // ---- start / stop ----
    m = lower.match(/^(?:snap\s+)?(start|stop)\s+([a-z0-9._-]+)/i);
    if (m) {
      const action = m[1];
      const target = m[2].replace(/['"]/g, '').trim();
      const c = await snap.findContainer(target);
      if (!c) return `❌ Container not found: \`${target}\``;
      if (action === 'start') await snap.startContainer(c.containerId);
      else await snap.stopContainer(c.containerId);
      return `${action === 'start' ? '▶️' : '⏹️'} *${action}* sent to *${c.name}*`;
    }

    // ---- heal ----
    m = lower.match(/^(?:snap\s+)?heal\s+([a-z0-9._-]+)(.*)$/i) ||
        lower.match(/\bheal\s+(?:the\s+)?([a-z0-9._-]+)(.*)/i);
    if (m) {
      const target = m[1].replace(/['"]/g, '').trim();
      const flags = (m[2] || '').toLowerCase();
      const forceRedeploy = /--redeploy|--force|redeploy/.test(flags);
      const result = await snap.healContainer(target, { forceRedeploy });
      return snap.formatHeal(result);
    }

    // ---- deploy ----
    // snap deploy owner/repo [name] [branch]
    m = raw.match(/^(?:snap\s+)?deploy\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)(?:\s+([a-zA-Z0-9._-]+))?(?:\s+([a-zA-Z0-9._/-]+))?/i);
    if (m) {
      const repo = m[1];
      const name = m[2] || repo.split('/')[1];
      const branch = m[3] || 'main';
      const res = await snap.deploy(
        { repo, name, branch, size: 'small' },
        `pasiya-deploy-${repo.replace('/', '-')}-${Date.now()}`
      );
      return [
        `🚀 *Deploy triggered*`,
        `Repo: \`${repo}\` @ \`${branch}\``,
        `Name: *${res.name || name}*`,
        res.containerId ? `Container: \`${res.containerId}\`` : '',
        res.deploymentId ? `Deployment: \`${res.deploymentId}\`` : '',
        res.url ? `URL: ${res.url}` : '',
        '',
        '_Build usually takes 2-5 minutes. Use_ `snap status <name>` _to check._',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // natural language deploy
    m = lower.match(/deploy\s+(?:repo\s+)?([a-z0-9_.-]+\/[a-z0-9_.-]+)/i);
    if (m) {
      const repo = m[1];
      const res = await snap.deploy(
        { repo, name: repo.split('/')[1], branch: 'main', size: 'small' },
        `pasiya-nl-${Date.now()}`
      );
      return `🚀 Deploy started for \`${repo}\`\n${res.url || res.containerId || JSON.stringify(res)}`;
    }

    // fallback help if it looked like a snap command
    if (/^snap\b/i.test(raw)) return HELP;

    return null;
  } catch (err) {
    const status = err.status || '';
    const code = err.code || '';
    let extra = '';
    if (status === 401) extra = '\n🔑 Check SNAPDEPLOY_API_KEY (token revoked/expired?).';
    if (status === 403) extra = '\n🔒 Scope too low or interactive-only action.';
    if (status === 402) extra = '\n💳 Plan limit (hours or deploy-cap). See `snap quota`.';
    if (status === 429) extra = '\n⏳ Rate limited — wait a moment.';
    return `❌ SnapDeploy error${status ? ` (${status})` : ''}${code ? ` [${code}]` : ''}\n${err.message}${extra}`;
  }
}

export default { tryHandle, HELP };
