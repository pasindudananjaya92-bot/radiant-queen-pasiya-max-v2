/**
 * Wave 30A — Sovereign Architect
 * Compares live OS posture vs ideal free-tier mobile OS and drafts upgrade blueprints.
 * Never auto-pushes code. Uses free aiRouter + local signals.
 */
export const VERSION = '30A';

export function architectHelp() {
  return [
    '🏛 *Sovereign Architect · ' + VERSION + '*',
    'Full-system upgrade brain (draft only)',
    '',
    '• `architect help` — this menu',
    '• `architect audit` — live posture vs ideal (no LLM)',
    '• `architect plan` — ranked upgrade blueprint (LLM)',
    '• `architect gap <area>` — deep dive one area',
    '',
    'Areas: vision · deploy · site · decisions · forge · memory · health · autonomy',
    '_Never git push. Founder picks → forge → gh → ONE redeploy._',
  ].join('\n');
}

async function gatherSignals() {
  const s = { version: VERSION, at: new Date().toISOString(), signals: {} };
  try {
    const h = await import('./healthManager.js');
    const r = await h.runFullCheck();
    s.signals.health = {
      ok: !!(r.ok || r.allOk),
      checks: (r.checks || []).map((c) => ({ name: c.name, ok: c.ok, detail: c.detail })),
    };
  } catch (e) {
    s.signals.health = { ok: false, error: e.message };
  }
  try {
    const d = await import('./deployGuardian.js');
    const r = await d.runDeployCheck();
    s.signals.deploy = {
      ok: r.ok !== false,
      fn: r.fnCount ?? r.functions,
      max: r.fnMax ?? 12,
      deploys: r.deploys24h,
    };
  } catch (e) {
    s.signals.deploy = { ok: false, error: e.message };
  }
  try {
    const dec = await import('./decisionsEngine.js');
    s.signals.decisions = dec.decisionsStatus();
  } catch (e) {
    s.signals.decisions = { error: e.message };
  }
  try {
    const wm = await import('./webMaster.js');
    const rows = await wm.listSections();
    s.signals.site = { sections: (rows || []).length };
  } catch (e) {
    s.signals.site = { error: e.message };
  }
  s.signals.env = {
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL),
    make: Boolean(process.env.MAKE_WEBHOOK_URL),
  };
  return s;
}

export async function architectAudit() {
  const g = await gatherSignals();
  const lines = ['🏛 *Architect audit · ' + VERSION + '*', ''];
  const h = g.signals.health;
  if (h?.checks) {
    const ok = h.checks.filter((c) => c.ok).length;
    lines.push('🩺 Health: ' + ok + '/' + h.checks.length + (h.ok ? ' ok' : ' issues'));
  }
  const d = g.signals.deploy;
  if (d && d.fn != null) lines.push('🛡 Functions: ' + d.fn + '/' + (d.max || 12));
  else lines.push('🛡 Deploy: ' + (d?.error || '—'));
  const dec = g.signals.decisions;
  if (dec && !dec.error)
    lines.push(
      '⚖ Decisions: ' + (dec.circuit_open ? 'circuit OPEN' : dec.has_key ? 'ready' : 'no key')
    );
  lines.push('🌐 Site sections: ' + (g.signals.site?.sections ?? '—'));
  lines.push(
    '🔑 Keys: Gemini ' +
      (g.signals.env.gemini ? '✅' : '❌') +
      ' · Groq ' +
      (g.signals.env.groq ? '✅' : '❌') +
      ' · Make ' +
      (g.signals.env.make ? '✅' : '❌')
  );
  lines.push('');
  lines.push('*Ideal free mobile OS gaps (static):*');
  lines.push('· Vision Hobby-safe + forge loop');
  lines.push('· Deploy budget awareness');
  lines.push('· Site lead capture → Supabase');
  lines.push('· Stronger Snap deep API (when host stable)');
  lines.push('· Architect → Forge → gh single-redeploy discipline');
  lines.push('');
  lines.push('_Next: `architect plan` for ranked blueprint_');
  return lines.join('\n');
}

export async function architectPlan() {
  const g = await gatherSignals();
  const ai = await import('./aiRouter.js');
  const system =
    'You are Sovereign Architect for Queen OS (Telegram bot, Vercel Hobby 12 fn / ~10s, Supabase, mobile Founder). ' +
    'Produce a RANKED upgrade blueprint. Free tier only. No paid Cloud. No silent git push. ' +
    'Format: Top 5 upgrades with impact, effort, risk, exact next command (forge/site/decide). Be concrete.';
  const user =
    'Live signals JSON:\n' +
    JSON.stringify(g, null, 0).slice(0, 3500) +
    '\n\nPropose the strongest free-tier upgrades beyond current 30A stack.';
  const r = await ai.routeTextAI({ system, user });
  return (
    '🏛 *Architect plan · ' +
    (r.provider || 'ai') +
    '*\n\n' +
    String(r.text || '').slice(0, 3500) +
    '\n\n_Draft only — run `forge plan <item>` then gh upload._'
  );
}

export async function architectGap(area) {
  const g = await gatherSignals();
  const ai = await import('./aiRouter.js');
  const r = await ai.routeTextAI({
    system:
      'Queen OS Architect. Free tier, Vercel Hobby, mobile Founder. Deep-dive one area. Concrete steps only.',
    user:
      'Area: ' +
      area +
      '\nSignals:\n' +
      JSON.stringify(g.signals, null, 0).slice(0, 2500) +
      '\n\nDeep dive: current state, gap, 3 implementation steps, test commands.',
  });
  return '🏛 *Architect gap · ' + area + '*\n\n' + String(r.text || '').slice(0, 3200);
}

export default {
  VERSION,
  architectHelp,
  architectAudit,
  architectPlan,
  architectGap,
};
