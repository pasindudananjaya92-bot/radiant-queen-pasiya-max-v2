// lib/healthRoutes.js
// Agent-23 — God Health Routes
// Version: 2026-11-03

import { runFullCheck } from './healthManager.js';

const HELP = `🩺 *God Health Monitor*

*Commands:*
• \`health\` / \`health help\` — this menu
• \`health check\` — full system status
• \`status\` — alias for health check

Checks: Vercel · Supabase · Make · SnapDeploy · cron-job.org`;

export async function tryHandle(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (!/^(health|status)\b/i.test(lower)) return null;

  if (/^(health|status)\s*(help|\?)$/i.test(lower) || lower === 'health help') {
    return HELP;
  }

  if (/^(health|status)(?:\s+check)?$/i.test(lower) || lower === 'health' || lower === 'status') {
    try {
      const report = await runFullCheck();
      const lines = report.checks.map(c => {
        const icon = c.ok ? '✅' : '❌';
        return `${icon} *${c.name}*: ${c.detail}`;
      });
      const header = report.allOk
        ? '🟢 *All systems operational*'
        : '🟡 *Some issues detected*';
      return `${header}\n\n${lines.join('\n')}\n\n_${report.ts}_`;
    } catch (err) {
      return `❌ Health check failed:\n${err.message || err}`;
    }
  }

  return HELP;
}

export default { tryHandle };
