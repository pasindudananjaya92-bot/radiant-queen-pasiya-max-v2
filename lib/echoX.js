/**
 * Echo X — ironclad draft (forbids generic help fallback)
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

async function loadStyle(supabase) {
  const fallback = {
    samples: [
      'Direct, practical. Sinhala+English mix when natural.',
      'Prefers surgical patches, quality over speed.',
      'Never give empty polite greetings when asked to draft a specific reply.',
      'When user says Hello from twin → acknowledge twin context and ask what action or patch they need.',
    ],
    enabled: true,
    autoAssist: false,
  };
  if (!supabase) return fallback;
  try {
    const { data } = await supabase
      .from('pasiya_fs')
      .select('content')
      .eq('path', '/Documents/echo-x-style.json')
      .maybeSingle();
    if (data?.content) {
      const j = JSON.parse(data.content);
      return { ...fallback, ...j, samples: j.samples?.length ? j.samples : fallback.samples };
    }
  } catch (_) {}
  return fallback;
}

async function saveStyle(supabase, style) {
  if (!supabase) return false;
  const path = '/Documents/echo-x-style.json';
  const content = JSON.stringify(style, null, 2);
  const { data: existing } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (existing?.id) {
    await supabase.from('pasiya_fs').update({ content }).eq('path', path);
  } else {
    await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
  }
  return true;
}

function parseEcho(text) {
  let rest = String(text || '').trim();
  rest = rest.replace(/^\/echo(@\w+)?/i, '').trim();
  if (!rest) return { action: 'status', arg: '' };

  const draftMatch = rest.match(/^draft(?:\s+|$)([\s\S]*)/i);
  if (draftMatch) return { action: 'draft', arg: (draftMatch[1] || '').trim() };

  const sampleMatch = rest.match(/^sample\s+([\s\S]+)/i);
  if (sampleMatch) return { action: 'sample', arg: sampleMatch[1].trim() };

  const teachMatch = rest.match(/^teach\s+([\s\S]+)/i);
  if (teachMatch) return { action: 'teach', arg: teachMatch[1].trim() };

  const low = rest.toLowerCase();
  if (low === 'on' || low === 'off' || low === 'status') return { action: low, arg: '' };
  if (low === 'auto on' || low.startsWith('auto on')) return { action: 'auto_on', arg: '' };
  if (low === 'auto off' || low.startsWith('auto off')) return { action: 'auto_off', arg: '' };

  return { action: 'draft', arg: rest };
}

/** True if output is a banned generic assistant greeting */
export function isGenericEcho(out) {
  const t = String(out || '').trim();
  if (!t) return true;
  const banned = [
    /how can i help/i,
    /what can i (do|help)/i,
    /i'?m echo x/i,
    /i am echo x/i,
    /digital twin for pasiya/i,
    /here to help you today/i,
    /feel free to ask/i,
    /let me know how i can assist/i,
    /how may i assist/i,
    /is there anything i can/i,
  ];
  if (banned.some((re) => re.test(t))) return true;
  // pure short greeting only
  if (/^(hi|hello|hey|ayubowan|ආයුබෝවන්)[\s!.😊]*$/i.test(t)) return true;
  return false;
}

function inputIsOnlyGreeting(arg) {
  return /^(hi|hello|hey|ayubowan|ආයුබෝවන්)([\s!.]*)$/i.test(String(arg || '').trim());
}

/** Deterministic fallback — never generic help */
function deterministicDraft(arg) {
  const a = String(arg || '').trim();
  if (/twin/i.test(a)) {
    return (
      'Hello from the twin side — got your signal.\n' +
      'Payload: «' +
      a.slice(0, 200) +
      '»\n' +
      'Next: name the surgical patch or command you want (e.g. /architect retest /echo).'
    );
  }
  return (
    'Ack: «' +
    a.slice(0, 240) +
    '»\n' +
    'Founder-mode reply ready. Say the action (patch / research / deploy) and I mirror it.'
  );
}

const SYSTEM_DRAFT =
  'You are Echo X — the founder digital twin for PasiyaOS (Radiant Queen).\n' +
  'HARD RULES (never break):\n' +
  '1) Output ONLY the reply text the founder would send. No roleplay labels.\n' +
  '2) The reply MUST engage the exact INCOMING MESSAGE content (quote or paraphrase key words).\n' +
  '3) FORBIDDEN phrases (if you use any, you fail):\n' +
  '   - "How can I help you"\n' +
  '   - "How can I help you today"\n' +
  '   - "I\'m Echo X"\n' +
  '   - "What can I do for you"\n' +
  '   - Any empty customer-support greeting.\n' +
  '4) If message mentions twin / Hello from twin: acknowledge twin, ask what patch or task is next.\n' +
  '5) Tone: direct, practical, light Sinhala+English OK, surgical, no fluff.\n' +
  '6) Length: 1–4 short sentences.';

export async function echoStatus(ctx, supabase) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  const st = await loadStyle(supabase);
  return {
    text:
      '🪞 ECHO X · Digital Twin\n' +
      'enabled: ' +
      (st.enabled ? 'ON' : 'OFF') +
      '\nsamples: ' +
      (st.samples?.length || 0) +
      '\n\n/echo draft <message>\n/echo sample <sentence>\n/echo teach <rule>\n/echo on|off',
  };
}

export async function echoCommand(ctx, supabase, text) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  const { action, arg } = parseEcho(text);
  const st = await loadStyle(supabase);

  if (action === 'status') return echoStatus(ctx, supabase);
  if (action === 'on') {
    st.enabled = true;
    await saveStyle(supabase, st);
    return { text: '🪞 Echo X ON' };
  }
  if (action === 'off') {
    st.enabled = false;
    st.autoAssist = false;
    await saveStyle(supabase, st);
    return { text: '🪞 Echo X OFF' };
  }
  if (action === 'auto_on') {
    st.autoAssist = true;
    st.enabled = true;
    await saveStyle(supabase, st);
    return { text: '🪞 Auto-assist ON' };
  }
  if (action === 'auto_off') {
    st.autoAssist = false;
    await saveStyle(supabase, st);
    return { text: '🪞 Auto-assist OFF' };
  }
  if (action === 'sample') {
    if (!arg) return { text: 'Usage: /echo sample <your real writing>' };
    st.samples = st.samples || [];
    st.samples.push(arg);
    if (st.samples.length > 40) st.samples = st.samples.slice(-40);
    await saveStyle(supabase, st);
    return { text: '🪞 Sample saved (' + st.samples.length + ')' };
  }
  if (action === 'teach') {
    if (!arg) return { text: 'Usage: /echo teach <style rule>' };
    st.samples = st.samples || [];
    st.samples.push('[STYLE] ' + arg);
    await saveStyle(supabase, st);
    return { text: '🪞 Style rule saved' };
  }

  if (action === 'draft') {
    if (!arg) {
      return {
        text: 'Usage: /echo draft <message to answer>\nExample: /echo draft Hello from twin',
      };
    }

    // Only-greeting input may get a short hello
    if (inputIsOnlyGreeting(arg)) {
      return {
        text:
          '🪞 ECHO DRAFT · local\n\n' +
          'Hi — twin online. Send a real payload after draft (task, patch, or question).',
      };
    }

    const styleBlock = (st.samples || []).slice(-15).join('\n- ');
    const system =
      SYSTEM_DRAFT + '\nStyle samples:\n- ' + (styleBlock || 'Direct, practical, no fluff.');

    const userPrompt =
      'INCOMING MESSAGE (answer THIS, not a generic hello):\n"""\n' +
      arg +
      '\n"""\n\n' +
      'Write one founder reply. Mention key words from the message. Never "How can I help".';

    let out = '';
    let engine = 'local';
    let model = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      const prompt =
        attempt === 1
          ? userPrompt
          : 'REJECTED previous reply (generic assistant voice).\n' +
            'Banned: How can I help / I\'m Echo X / empty greeting.\n' +
            'Answer THIS message with substance:\n"""' +
            arg +
            '"""\n' +
            (attempt === 3
              ? 'If unsure, acknowledge the exact words and propose next surgical step.'
              : '');

      const r = await powerChat(prompt, {
        system,
        temperature: attempt === 1 ? 0.35 : 0.2,
        maxTokens: 700,
      });
      if (!r.ok) {
        if (attempt === 3) {
          return {
            text:
              '🪞 ECHO DRAFT · fallback\n\n' +
              deterministicDraft(arg) +
              '\n\n(AI engines: ' +
              (r.error || 'fail') +
              ')',
          };
        }
        continue;
      }
      out = String(r.text || '').trim();
      engine = r.engine || 'ai';
      model = r.model || '';
      if (!isGenericEcho(out)) {
        return {
          text: '🪞 ECHO DRAFT · ' + engine + (model ? ' · ' + model : '') + '\n\n' + out,
        };
      }
    }

    // All AI attempts were generic → deterministic, never help-desk
    return {
      text: '🪞 ECHO DRAFT · guarded-fallback\n\n' + deterministicDraft(arg),
    };
  }

  return echoStatus(ctx, supabase);
}

export default { echoCommand, echoStatus, parseEcho, isGenericEcho };
