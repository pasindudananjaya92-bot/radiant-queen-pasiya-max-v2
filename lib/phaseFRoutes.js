/**
 * Phase F — seal + ops shortcuts (founder only)
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export function isPhaseFCommand(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c === '/seal' || c === '/phasef' || c === '/v5000';
}

export async function handlePhaseFRoute({ cmd, text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const c = String(cmd || '').toLowerCase();
  const body = String(text || '')
    .replace(/^\/\w+\s*/i, '')
    .trim()
    .toLowerCase();

  if (c === '/seal' || c === '/v5000' || (c === '/phasef' && (body === 'seal' || body === 'status' || !body))) {
    return (
      '🏆 PASIYAOS v5000 · SEAL STATUS\n\n' +
      'Phase A/B: Repo Surgeon + Architect + Expect ✅\n' +
      'Phase C: Healcheck + Patchlog ✅\n' +
      'Phase D: Hull Control + Error DNA ✅\n' +
      'Phase D2: Hull B worker routing ✅\n' +
      'Phase E: Shadow Twin + Hull Ops + SQL runner ✅\n' +
      'Phase F: DNA auto-wire + Shadow due + seal ✅\n\n' +
      'Hull A: light commands · Hull B: heavy research\n' +
      'Prometheus: OFF (safe)\n' +
      'Vercel API budget: stay ≤12 functions\n\n' +
      'Quick:\n' +
      '/healcheck · /hulljobs · /errordna · /shadow list\n' +
      '/shadow due · /architect status · /debug pending'
    );
  }

  if (c === '/phasef') {
    return (
      'Phase F commands:\n' +
      '/seal — official v5000 status card\n' +
      '/shadow due — deliver scheduled drafts now\n' +
      '/errordna — top failure fingerprints\n' +
      'Failures auto-log to rq_error_dna when routes catch errors.'
    );
  }
  return null;
}

export default { isPhaseFCommand, handlePhaseFRoute };
