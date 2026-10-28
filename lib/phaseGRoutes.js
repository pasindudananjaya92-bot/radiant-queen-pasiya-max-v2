const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export function isPhaseGCommand(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c === '/cronjobs' || c === '/phaseg';
}

export async function handlePhaseGRoute({ cmd, text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const c = String(cmd || '').toLowerCase();
  const body = String(text || '')
    .replace(/^\/\w+\s*/i, '')
    .trim()
    .toLowerCase();

  if (c === '/cronjobs' || (c === '/phaseg' && (body === 'help' || !body))) {
    const base =
      process.env.VERCEL_URL ||
      process.env.BOT_PUBLIC_URL ||
      'https://radiant-queen-pasiya-max-v2.vercel.app';
    const host = String(base).replace(/^https?:\/\//, '').replace(/\/$/, '');
    const secret = process.env.CRON_SECRET ? '***set***' : 'MISSING';
    return (
      '⏱ PHASE G · SCHEDULED AUTONOMY\n\n' +
      'Cron endpoint (Hull A):\n' +
      'https://' +
      host +
      '/api/cron?job=JOB&secret=CRON_SECRET\n\n' +
      'Jobs:\n' +
      '• shadow — deliver due Shadow drafts\n' +
      '• hullpoll — poke Hull B / local queue\n' +
      '• dna — Error DNA digest DM\n' +
      '• phaseg — shadow + hullpoll together\n' +
      '• ghost|track|watch|digest — legacy\n\n' +
      'CRON_SECRET: ' +
      secret +
      '\nHULL_B_URL: ' +
      (process.env.HULL_B_URL ? 'set' : 'unset (local poll)') +
      '\n\n' +
      'Manual test:\n' +
      '/phaseg run shadow\n' +
      '/phaseg run hullpoll\n' +
      '/phaseg run phaseg'
    );
  }

  if (c === '/phaseg' && body.startsWith('run ')) {
    const which = body.slice(4).trim();
    try {
      const g = await import('./cronPhaseG.js');
      if (which === 'shadow') return '🧪 ' + JSON.stringify(await g.jobShadowDue());
      if (which === 'hullpoll' || which === 'hull')
        return '🧪 ' + JSON.stringify(await g.jobHullPoll());
      if (which === 'dna') return '🧪 ' + JSON.stringify(await g.jobDnaDigest());
      if (which === 'phaseg' || which === 'all') {
        const shadow = await g.jobShadowDue();
        const hull = await g.jobHullPoll();
        return '🧪 ' + JSON.stringify({ shadow, hull });
      }
      return 'Unknown job. Use: shadow | hullpoll | dna | phaseg';
    } catch (e) {
      return 'phaseg run error: ' + String(e.message || e).slice(0, 300);
    }
  }

  return null;
}

export default { isPhaseGCommand, handlePhaseGRoute };
