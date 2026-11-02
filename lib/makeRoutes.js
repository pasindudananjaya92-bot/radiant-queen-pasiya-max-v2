// lib/makeRoutes.js
// Agent-20 Routes — Webhook Mode (Free Plan Compatible)
// Version: 2026-11-02-fix
// IMPORTANT: exports tryHandle (matches agentExecute.js wiring)

import { isConfigured, triggerScenario, listConfigured } from './makeManager.js';

const HELP = `🛠️ *Make.com Manager (Webhook Mode)*

*Commands:*
• \`make help\` — this menu
• \`make list\` — show configured scenarios
• \`make run\` — trigger default / master webhook
• \`make run <name>\` — trigger named scenario

*Examples:*
\`make run\`
\`make run keepalive\`
\`make run digest\`

⚠️ Free plan: only *triggering* works.
Status / Stop / full list need paid API access.`;

export async function tryHandle(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  // help
  if (/^(make\s+help|make\s+\?|make)$/i.test(lower)) {
    return HELP;
  }

  // list
  if (/^make\s+list$/i.test(lower)) {
    if (!isConfigured()) {
      return '❌ MAKE_WEBHOOK_URL is not set.\nAdd it in Vercel → Environment Variables.';
    }
    const list = listConfigured();
    return `📋 *Configured Make scenarios*\n\n${list.map(s => `• ${s}`).join('\n')}\n\nUse: \`make run <name>\``;
  }

  // run
  const runMatch = lower.match(/^make\s+run(?:\s+([a-z0-9_-]+))?$/i);
  if (runMatch) {
    if (!isConfigured()) {
      return '❌ MAKE_WEBHOOK_URL is not set.\nAdd it in Vercel → Environment Variables and redeploy.';
    }

    const scenarioKey = runMatch[1] || 'default';

    try {
      const result = await triggerScenario(scenarioKey);
      return `✅ *Make.com triggered*\n\nScenario: \`${result.scenario}\`\nHTTP: ${result.status}\nResponse: ${result.response}`;
    } catch (err) {
      return `❌ Make webhook error:\n${err.message}`;
    }
  }

  // catch other make * commands and explain limitation
  if (/^make\s+/i.test(lower)) {
    return `⚠️ That command needs the Make API (paid plan).\n\nOn Free plan you can only use:\n• \`make run\`\n• \`make run <name>\`\n• \`make list\`\n• \`make help\``;
  }

  return null;
}

// Alias for safety
export const tryMakeHandle = tryHandle;

export default { tryHandle, tryMakeHandle, HELP };
