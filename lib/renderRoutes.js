// lib/renderRoutes.js — Agent-31 Telegram commands
import {
  renderStatus,
  listServices,
  triggerDeploy,
  listDeploys,
  resolveService,
  formatServices,
  formatService,
  formatDeploys,
} from './renderManager.js';

const HELP = `🖥 *Render Manager (Agent-31)*

\`render status\` — API key ready?
\`render services\` — list services / workers
\`render service <id|name>\` — details
\`render deploy <id|name>\` — trigger deploy
\`render deploys <id|name>\` — recent deploys
\`render help\`

*Env:* \`RENDER_API_KEY\` (Vercel)

*Hull C worker:* after first dashboard setup, manage deploys from chat.
_Logs stream:_ use Render dashboard for live tail; API gives deploy status._`;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!/^render\b/i.test(raw)) return null;
  if (!isFounder(ctx)) return '👑 Founder-only · Render Manager';

  try {
    if (/^render\s*(help|\?|$)/i.test(raw)) return HELP;

    if (/^render\s+status$/i.test(raw)) {
      const s = renderStatus();
      return (
        `🖥 *Render status*\n` +
        `API key: ${s.ready ? '✅' : '❌ missing RENDER_API_KEY'}\n` +
        `API: ${s.api}`
      );
    }

    if (/^render\s+services?$/i.test(raw)) {
      const list = await listServices({ limit: 20 });
      return formatServices(list);
    }

    let m = raw.match(/^render\s+service\s+(.+)$/i);
    if (m) {
      const s = await resolveService(m[1].trim());
      return formatService(s);
    }

    m = raw.match(/^render\s+deploy\s+(.+)$/i);
    if (m) {
      const s = await resolveService(m[1].trim());
      const d = await triggerDeploy(s.id);
      return (
        `🚀 *Deploy triggered*\n` +
        `Service: ${s.name} (\`${s.id}\`)\n` +
        `Deploy: \`${d.id || '?'}\` · ${d.status || 'created'}`
      );
    }

    m = raw.match(/^render\s+deploys?\s+(.+)$/i);
    if (m) {
      const s = await resolveService(m[1].trim());
      const d = await listDeploys(s.id, { limit: 5 });
      return `*${s.name}*\n` + formatDeploys(d);
    }

    m = raw.match(/^render\s+logs?\s+(.+)$/i);
    if (m) {
      const s = await resolveService(m[1].trim());
      const d = await listDeploys(s.id, { limit: 3 });
      return (
        `📜 *${s.name}* — recent deploys (live log stream = Render dashboard)\n` +
        formatDeploys(d)
      );
    }

    return HELP;
  } catch (e) {
    return '❌ Render: ' + (e.message || e);
  }
}

export default { tryHandle };
