// lib/healthRoutes.js — Wave 29A fix (allOk/ts compat)
import { runFullCheck, formatHealth } from './healthManager.js';

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
      return formatHealth(report);
    } catch (err) {
      return '❌ Health check failed:\n' + (err.message || err);
    }
  }

  return HELP;
}

export default { tryHandle };
