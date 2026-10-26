/**
 * EMERGENCY: Prometheus DISABLED
 * All exports are no-ops so bot.catch never blocks the request.
 * Set PROMETHEUS_DISABLED=0 later to re-enable a safe version.
 */

const DISABLED =
  String(process.env.PROMETHEUS_DISABLED || '1').toLowerCase() !== '0';

export function guessTargetFile() {
  return 'lib/unknown.js';
}

export async function runPrometheus() {
  return {
    ok: false,
    skipped: true,
    reason: DISABLED ? 'prometheus disabled (emergency)' : 'noop',
  };
}

/** bot.catch handler — never calls AI, never waits */
export function createPrometheusCatch(_bot) {
  return async (err, ctx) => {
    try {
      console.error('[prometheus-disabled]', err?.message || err);
      // Soft reply to founder only — never start AI loop
      const admin = String(process.env.ADMIN_ID || '').trim();
      const from = String(ctx?.from?.id || '');
      if (admin && from === admin && ctx?.reply) {
        await ctx
          .reply(
            '⚠️ Error (Prometheus OFF):\n' +
              String(err?.message || err).slice(0, 280)
          )
          .catch(() => {});
      }
    } catch (_) {
      /* never throw from catch */
    }
  };
}

export default {
  runPrometheus,
  createPrometheusCatch,
  guessTargetFile,
  DISABLED: true,
};
