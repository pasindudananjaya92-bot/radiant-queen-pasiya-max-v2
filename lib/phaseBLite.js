/**
 * v5000 Phase B (lite) — Architect retest + expect status
 * Commands handled via existing routes when wired; this module is helpers.
 */
export function phaseBHelp() {
  return (
    '🧱 PHASE B · Architect + Expect\n\n' +
    '/expect list\n' +
    '/expect /echo :: must include twin\n' +
    '/architect retest /echo\n' +
    '/architect status\n' +
    '/debug file … → /debug apply <id>\n\n' +
    'Flow: set expect rule → debug patch → apply → architect retest.'
  );
}

export default { phaseBHelp };
