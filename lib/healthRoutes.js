import { runFullCheck } from './healthManager.js';

const HELP = `🩺 *God Health Monitor*

*Commands:*
• \`health\` / \`health check\` — full system status
• \`status\` — alias
• \`health help\`

Checks: Vercel · Supabase · Make · SnapDeploy · cron-job.org · Upstash(optional)
On issues: auto-emits Signal Desk events (Nervous System).`;

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
      const lines = report.checks.map((c) => {
        const icon = c.ok ? '✅' : '❌';
        return `${icon} *${c.name}*: ${c.detail}`;
      });
      const header = report.allOk
        ? '🟢 *All systems operational*'
        : '🟡 *Some issues detected*';

      // Nervous System — emit DOWN signals (never block health reply)
      let nerveNote = '';
      try {
        if (!report.allOk) {
          const { emitSignal } = await import('./signalManager.js');
          const down = (report.checks || []).filter(
            (c) => c && c.ok === false && c.name !== 'Upstash'
          );
          for (const c of down.slice(0, 6)) {
            await emitSignal({
              kind: 'health',
              source: 'health',
              title: `${c.name} DOWN`,
              body: String(c.detail || '').slice(0, 400),
              level: 'error',
              meta: { via: 'health_command' },
            });
          }
          if (down.length) nerveNote = `\n\n🧬 Nervous: emitted ${down.length} signal(s) · \`signal list\``;
        }
      } catch (_) {}

      return `${header}\n\n${lines.join('\n')}\n\n_${report.ts}_${nerveNote}`;
    } catch (err) {
      return `❌ Health check failed:\n${err.message || err}`;
    }
  }

  return HELP;
}

export default { tryHandle };
