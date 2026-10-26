/** Prometheus HARD OFF — never AI-loop, never block */
export async function runPrometheus() {
  return { ok: false, skipped: true, reason: 'disabled' };
}
export function createPrometheusCatch() {
  return async (err, ctx) => {
    try {
      console.error('[prometheus-off]', err?.message || err);
      const admin = String(process.env.ADMIN_ID || '').trim();
      if (admin && String(ctx?.from?.id || '') === admin && ctx?.reply) {
        await ctx.reply('⚠️ ' + String(err?.message || err).slice(0, 240)).catch(() => {});
      }
    } catch (_) {}
  };
}
export function guessTargetFile() {
  return 'lib/unknown.js';
}
export default { runPrometheus, createPrometheusCatch, guessTargetFile };
