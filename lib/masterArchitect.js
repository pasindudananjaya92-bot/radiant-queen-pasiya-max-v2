/**
 * Omniscient Master Architect — permanent self-evolution engine
 *
 * Constitution (immutable rules in memory + pasiya_fs):
 * - Founder tests commands; bot must produce correct domain result
 * - No generic/wrong fallbacks when a specialized module exists
 * - On /expect or /architect failed — run Chronos-V diagnose+fix loop
 * - Max autonomy: 2 pushes / 15 min; always report outcome
 * - Prefer lib/* surgical patches over rewriting api/telegram.js
 */
import { powerChat, powerRadar, formatRadar } from './powerhouse.js';
import { handleChronosV } from './chronosV.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

const CONSTITUTION = `
PASIYAOS MASTER ARCHITECT CONSTITUTION
1. You own GitHub + Vercel + Supabase for this project. Use them to keep the bot correct.
2. Specialized modules win: /echo → echoX, /research → deepMindPro, never generic AI greetings.
3. When founder says output is wrong (/expect or /architect failed), you diagnose and patch.
4. Never infinite-loop deploys. Max 2 auto GitHub pushes per 15 minutes.
5. Prefer fixing lib/*.js. Touch api/telegram.js only for routing bugs.
6. After a push, tell founder the exact re-test command. Do not claim success until they confirm or /architect verify passes.
7. Store lessons in /Documents/architect-lessons.json so the same mistake is not repeated.
`.trim();

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

async function loadJSON(supabase, path, fallback) {
  if (!supabase) return fallback;
  try {
    const { data } = await supabase.from('pasiya_fs').select('content').eq('path', path).maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return fallback;
}

async function saveJSON(supabase, path, obj) {
  if (!supabase) return;
  const content = JSON.stringify(obj, null, 2);
  const { data: ex } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (ex?.id) await supabase.from('pasiya_fs').update({ content }).eq('path', path);
  else await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
}

export async function handleArchitect({ cmd, text, ctx, supabase, bot }) {
  if (!isFounder(ctx)) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/architect(@\w+)?\s*/i, '')
    .replace(/^\/master(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🏛 MASTER ARCHITECT\n' +
      CONSTITUTION.split('\n').slice(0, 8).join('\n') +
      '\n\nCommands:\n' +
      '/architect status — radar + constitution\n' +
      '/architect failed <note> — same as /expect then auto diagnose\n' +
      '/architect fix — Chronos-V fix loop\n' +
      '/architect lesson <text> — remember permanent rule\n' +
      '/architect lessons — list lessons\n' +
      '/architect verify /echo draft test — AI checks if reply looks correct'
    );
  }

  if (raw === 'status' || raw === 'constitution') {
    const radar = await powerRadar();
    const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
    return (
      formatRadar(radar) +
      '\n\n🏛 Constitution active\nLessons: ' +
      (lessons.items?.length || 0) +
      '\n\n' +
      CONSTITUTION.slice(0, 900)
    );
  }

  if (raw.startsWith('lesson ')) {
    const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
    lessons.items = lessons.items || [];
    lessons.items.push({ t: Date.now(), text: raw.slice(7).trim() });
    if (lessons.items.length > 50) lessons.items = lessons.items.slice(-50);
    await saveJSON(supabase, '/Documents/architect-lessons.json', lessons);
    return '🏛 Lesson stored (' + lessons.items.length + ')';
  }

  if (raw === 'lessons') {
    const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
    if (!lessons.items?.length) return 'No lessons yet.';
    return (
      '🏛 LESSONS\n' +
      lessons.items
        .slice(-15)
        .map((x, i) => i + 1 + '. ' + x.text)
        .join('\n')
    );
  }

  // failed → record expect + diagnose
  if (raw.startsWith('failed')) {
    const note = raw.replace(/^failed\s*/i, '') || 'wrong or silent output';
    await handleChronosV({
      cmd: '/expect',
      text: '/expect ' + note,
      ctx,
      supabase,
      bot,
    });
    const diag = await handleChronosV({
      cmd: '/chronosv',
      text: '/chronosv diagnose',
      ctx,
      supabase,
      bot,
    });
    return '🏛 Recorded failure.\n\n' + diag + '\n\nNext: /architect fix';
  }

  if (raw === 'fix' || raw.startsWith('fix')) {
    const out = await handleChronosV({
      cmd: '/chronosv',
      text: '/chronosv fix',
      ctx,
      supabase,
      bot,
    });
    return '🏛 FIX LOOP\n' + out;
  }

  if (raw.startsWith('verify ')) {
    const probe = raw.slice(7).trim();
    const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
    const r = await powerChat(
      'Founder will run this Telegram command:\n' +
        probe +
        '\n\nLessons:\n' +
        (lessons.items || []).map((x) => x.text).join('\n') +
        '\n\nWhat MUST the bot output look like? Give a strict acceptance checklist (5 bullets).',
      { system: CONSTITUTION, maxTokens: 700 }
    );
    if (!r.ok) return 'verify fail: ' + (r.error || '');
    return '🏛 VERIFY CHECKLIST · ' + r.engine + '\n\n' + r.text;
  }

  return handleArchitect({
    cmd: '/architect',
    text: '/architect help',
    ctx,
    supabase,
    bot,
  });
}

export default { handleArchitect, CONSTITUTION };
