/**
 * /seal — v1000 project status card (read-only)
 */
export async function buildSeal(supabase) {
  const features = [
    'Neural memory (/neuralmemory)',
    'Log radar (/logs)',
    'PR review (/review)',
    'Secrets scan (/secrets)',
    'DB advisor (/dbslow)',
    'Domain watch (/domain)',
    'Sandbox (/sandbox)',
    'Weekly digest (/weekly)',
    'SQL God Mode (/sql)',
    'Chronos rollback (/chronos)',
    'Intent ledger (/audit)',
    'Panopticon (/secreport)',
    'Surgical ghHeal',
    'Fortress + Triad',
  ];

  let auditCount = '?';
  let neuralCount = '?';
  if (supabase) {
    try {
      const a = await supabase.from('rq_audit_log').select('*', { count: 'exact', head: true });
      if (a.count != null) auditCount = a.count;
    } catch (_) {}
    try {
      const n = await supabase.from('rq_neural_memory').select('*', { count: 'exact', head: true });
      if (n.count != null) neuralCount = n.count;
    } catch (_) {}
  }

  return {
    ok: true,
    version: 'v1000-P4-SEAL',
    apiSlots: '7/12',
    auditCount,
    neuralCount,
    features,
  };
}

export function formatSeal(r) {
  if (!r.ok) return 'Seal failed';
  return (
    'PASIYAOS v1000 · PROJECT SEAL\n' +
    'Version: ' +
    r.version +
    '\nVercel API: ' +
    r.apiSlots +
    ' (Hobby safe)\n' +
    'Audit rows: ' +
    r.auditCount +
    ' · Neural: ' +
    r.neuralCount +
    '\n\nCore capabilities:\n' +
    r.features.map((f) => '✓ ' + f).join('\n') +
    '\n\nHull B (Power Plant) reserved for when slots approach 12.\n' +
    'Founder-only · free-tier · phone-dev complete for this era.\n' +
    '/seal · /constitution · /weekly · /selfheal'
  ).slice(0, 3900);
}

export default { buildSeal, formatSeal };
