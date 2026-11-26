/** Proposal Factory · 37-S5 · draft pack only */
const VERSION = '37-S5';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

export async function buildProposal({ client, amount, scope }) {
  const c = String(client || 'Client').trim();
  const a = String(amount || 'Talk').trim();
  const s = String(scope || 'Queen OS mobile setup').trim();

  let webTip = 'Mobile-first + Baseline 2024 · a11y labels · no long-task jank';
  try {
    const wg = await safeImport('./webGuidance.js');
    if (wg && typeof wg.getGuide === 'function') {
      const g = wg.getGuide('long-task') || wg.getGuide('baseline');
      if (g && g.title) webTip = g.title + ' checklist available via `web guide list`';
    }
  } catch (_) {}

  let twinLine =
    'Founder mode: scope + timeline fixed. Money/code only after I approve. Queen OS mobile-first.';
  try {
    const twin = await safeImport('./twinEngine.js');
    if (twin && typeof twin.createDraft === 'function') {
      await twin.createDraft({
        message: 'Proposal for ' + c + ' · ' + a + ' · ' + s,
        source: 'proposal_factory',
      });
    }
  } catch (_) {}

  return [
    '📄 *Proposal Pack · ' + VERSION + '*',
    'Client: ' + c,
    'Investment: ' + a,
    'Scope: ' + s,
    '',
    '*Outline*',
    '1. Discovery (mobile ops constraints)',
    '2. Build (Telegram + Vercel + Supabase stack)',
    '3. Harden (health · deploy gate · drafts-only money)',
    '4. Handoff (Founder training)',
    '',
    '*Web checklist*',
    '· ' + webTip,
    '',
    '*Reply draft (not sent)*',
    twinLine,
    '',
    'Next: `deal create ' + c + ' | ' + a + ' | ' + s + ' | price?`',
    '_Draft only · no Stripe send · no auto TG._',
  ].join('\n');
}

export function helpText() {
  return [
    '📄 *Proposal Factory · ' + VERSION + '*',
    '',
    '• `proposal help`',
    '• `proposal pack | Client | amount | scope`',
    '• `proposal | Client | amount | scope`',
    '',
    '_Creates text pack + optional twin draft. Never sends._',
  ].join('\n');
}

export default { VERSION, buildProposal, helpText };
