/**
 * v5000 Phase A — /expect deepen helpers
 * Ensures rules load for architect retest messaging.
 */
export function formatExpectHelp() {
  return (
    '📐 EXPECT · Phase A\n' +
    '/expect /cmd :: must include <text>\n' +
    '/expect list\n' +
    '/expect doctor\n' +
    '/architect retest /cmd  ← auto-merges DB rules\n\n' +
    'Rules persist in rq_expect_rules (Supabase).'
  );
}

export default { formatExpectHelp };
