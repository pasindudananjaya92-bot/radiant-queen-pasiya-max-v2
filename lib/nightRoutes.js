// lib/nightRoutes.js — Agent-26 commands
import {
  runNightScan,
  runMorningBrief,
  runNightOpsNow,
  getVoicePref,
  setVoicePref,
} from './nightOperator.js';

const HELP = `🌙 *Night Operator (Agent-26)*

*Commands*
• \`night help\` — this menu
• \`night scan\` — run health + activity collect now
• \`night report\` / \`night brief\` — send morning briefing now (text + voice if enabled)
• \`night run\` — full cycle (scan + brief) now
• \`voice on\` — enable voice replies for briefing
• \`voice off\` — disable voice replies
• \`voice status\` — current preference

*Schedule (cron-job.org)*
02:00 → /api/cron?job=nightscan&secret=YOUR_CRON_SECRET
07:00 → /api/cron?job=morningbrief&secret=YOUR_CRON_SECRET

TTS: free Google TTS via existing lib/tts.js (no new paid API).`;

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (/^(voice)\s+(on|off|status)$/i.test(lower) || /^(night)\b/i.test(lower)) {
    // ok
  } else {
    return null;
  }

  const uid = String(ctx?.from?.id || process.env.ADMIN_ID || '');

  try {
    if (/^night\s*(help|\?|$)/i.test(lower)) return HELP;

    if (/^voice\s+on$/i.test(lower)) {
      await setVoicePref(uid, true);
      return '🎙 Voice replies *ON* for morning briefing.';
    }
    if (/^voice\s+off$/i.test(lower)) {
      await setVoicePref(uid, false);
      return '🔇 Voice replies *OFF*. Text briefing only.';
    }
    if (/^voice\s+status$/i.test(lower)) {
      const on = await getVoicePref(uid);
      return on ? '🎙 Voice is *ON*' : '🔇 Voice is *OFF*';
    }

    if (/^night\s+scan$/i.test(lower)) {
      const r = await runNightScan({ alertOnFail: false });
      return (r.briefing || 'Scan complete.').slice(0, 3800);
    }

    if (/^night\s+(report|brief|briefing)$/i.test(lower)) {
      const r = await runMorningBrief({});
      if (!r.ok) return '❌ Brief failed: ' + (r.error || r.send?.error || 'unknown');
      const v = r.voiceResult?.ok ? '\n🎙 Voice note sent.' : r.voiceResult?.skipped ? '\n(Voice skipped — voice off)' : '\n(Voice TTS issue: ' + (r.voiceResult?.error || '') + ')';
      return '✅ Morning briefing delivered to your private chat.' + v;
    }

    if (/^night\s+run$/i.test(lower)) {
      const r = await runNightOpsNow();
      return (
        '✅ Night ops full cycle done.\n' +
        `Scan OK: ${r.scan?.allOk ? 'yes' : 'issues'}\n` +
        `Brief sent: ${r.brief?.ok ? 'yes' : 'no'}\n` +
        `Voice: ${r.brief?.voiceResult?.ok ? 'yes' : 'no'}`
      );
    }

    return HELP;
  } catch (e) {
    return '❌ Night Operator: ' + (e.message || e);
  }
}

export default { tryHandle };
