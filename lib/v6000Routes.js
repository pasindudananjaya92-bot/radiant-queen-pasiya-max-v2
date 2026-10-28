/**
 * V6000 routes: /surgeon /skill /skills
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export function isV6000Command(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c === '/surgeon' || c === '/skill' || c === '/skills' || c === '/v6000';
}

export async function handleV6000Route({ cmd, text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const c = String(cmd || '').toLowerCase();
  const body = String(text || '')
    .replace(/^\/\w+(?:@\w+)?\s*/i, '')
    .trim();

  if (c === '/v6000' || (c === '/surgeon' && (!body || body === 'help'))) {
    return (
      '⚔️ V6000 MULTI-FILE SURGEON + HULL SKILLS\n\n' +
      'Surgeon:\n' +
      '/debug file lib/x.js :: instruction --local\n' +
      '  → loads TARGET + imported RELATED files\n' +
      '  → God-Tier semantic + balance checks\n' +
      '/surgeon ctx lib/x.js — show import graph only\n\n' +
      'Skills (local or Hull B):\n' +
      '/skills — list\n' +
      '/skill syntax_check lib/shadowTwin.js\n' +
      '/skill shell_py print(2+2)\n' +
      '/skill browse https://example.com\n' +
      '/skill shadow_due\n' +
      '/skill research <query>\n\n' +
      'Always use --local for /debug code repair.'
    );
  }

  if (c === '/surgeon') {
    const m = body.match(/^ctx\s+(\S+)/i);
    if (m) {
      const sc = await import('./surgeonContext.js');
      const ctx2 = await sc.buildSurgeonContext(m[1]);
      return (
        '📂 SURGEON CONTEXT · ' +
        ctx2.target.path +
        '\nbytes=' +
        ctx2.target.content.length +
        '\nimports: ' +
        (ctx2.imports.join(', ') || '(none)') +
        '\nrelated loaded: ' +
        ctx2.related.length
      );
    }
    return 'Usage: /surgeon ctx lib/phaseADebug.js';
  }

  if (c === '/skills') {
    const { SKILL_NAMES } = await import('./hullSkills.js');
    return '🛰 SKILLS\n' + SKILL_NAMES.map((s) => '• ' + s).join('\n');
  }

  if (c === '/skill') {
    if (!body) return 'Usage: /skill <name> [payload…]';
    const parts = body.split(/\s+/);
    const name = parts[0].toLowerCase();
    const rest = parts.slice(1).join(' ').trim();
    const payload = {};
    if (name === 'syntax_check') payload.path = rest;
    else if (name === 'shell_py') payload.code = rest || 'print(2+2)';
    else if (name === 'browse') payload.url = rest;
    else if (name === 'research') payload.query = rest;
    else if (name === 'shadow_due') payload.limit = 5;
    else payload.q = rest;

    const { runSkill } = await import('./hullSkills.js');
    const result = await runSkill(name, payload);
    const preview =
      typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 0).slice(0, 3500);
    return '✅ skill:' + name + '\n' + preview;
  }

  return null;
}

export default { isV6000Command, handleV6000Route };
