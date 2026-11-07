// lib/sentryRoutes.js — founder Telegram commands for Sentry
import {
  sentryStatus,
  listIssues,
  getIssue,
  resolveIssue,
  formatIssues,
  formatIssueDetail,
} from './sentryManager.js';

const HELP = `🐛 *Sentry Manager*

\`sentry status\` — DSN / API සබඳතාව
\`sentry issues\` — unresolved දෝෂ
\`sentry issue <id>\` — විස්තර
\`sentry resolve <id>\` — resolved කරන්න
\`sentry help\`

*Env (Vercel):*
SENTRY_DSN — error capture
SENTRY_AUTH_TOKEN — API (list/resolve)
SENTRY_ORG — org slug
SENTRY_PROJECT — project slug

Token: sentry.io → Settings → Auth Tokens
Scopes: project:read, event:read, issue:read, issue:write`;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!/^sentry\b/i.test(raw)) return null;
  if (!isFounder(ctx)) return '👑 Founder-only · Sentry Manager';

  const lower = raw.toLowerCase();
  try {
    if (/^sentry\s*(help|\?|$)/i.test(raw)) return HELP;

    if (/^sentry\s+status$/i.test(raw)) {
      const s = sentryStatus();
      return (
        `🐛 *Sentry status*\n` +
        `DSN: ${s.dsn ? '✅' : '❌'}\n` +
        `API token: ${s.token ? '✅' : '❌'}\n` +
        `Org: \`${s.org}\`\n` +
        `Project: \`${s.project}\`\n` +
        `API ready: ${s.ready ? '✅' : '❌'}`
      );
    }

    if (/^sentry\s+issues?\b/i.test(raw)) {
      const issues = await listIssues({ limit: 12 });
      return formatIssues(issues);
    }

    const one = raw.match(/^sentry\s+issue\s+(\S+)/i);
    if (one) {
      const it = await getIssue(one[1]);
      return formatIssueDetail(it);
    }

    const res = raw.match(/^sentry\s+resolve\s+(\S+)/i);
    if (res) {
      const it = await resolveIssue(res[1]);
      return `✅ Resolved \`${res[1]}\`\n${String(it?.title || '').slice(0, 120)}`;
    }

    return HELP;
  } catch (e) {
    return '❌ Sentry: ' + (e.message || e);
  }
}

export default { tryHandle };
