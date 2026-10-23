/**
 * Project Echo X — Digital Twin (FIXED draft routing)
 * /echo draft <anything> must answer THAT prompt in founder voice — never a generic greeting.
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
    await supabase.from('pasiya_fs').update({ content, updated_at: new Date().toISOString() }).eq('path', path);
  } else {
    await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
  }
  return true;
}

/** Parse /echo subcommand from full message text */
function parseEcho(text) {
  let rest = String(text || '').trim();
  rest = rest.replace(/^\/echo(@\w+)?/i, '').trim();
  if (!rest) return { action: 'status', arg: '' };

  // draft: everything after "draft" is the payload (critical fix)
  const draftMatch = rest.match(/^draft(?:\s+|$)([\s\S]*)/i);
  if (draftMatch) {
    return { action: 'draft', arg: (draftMatch[1] || '').trim() };
  }
  const sampleMatch = rest.match(/^sample\s+([\s\S]+)/i);
  if (sampleMatch) return { action: 'sample', arg: sampleMatch[1].trim() };
  const teachMatch = rest.match(/^teach\s+([\s\S]+)/i);
  if (teachMatch) return { action: 'teach', arg: teachMatch[1].trim() };

  const low = rest.toLowerCase();
  if (low === 'on' || low === 'off' || low === 'status') return { action: low, arg: '' };
  if (low === 'auto on' || low.startsWith('auto on')) return { action: 'auto_on', arg: '' };
  if (low === 'auto off' || low.startsWith('auto off')) return { action: 'auto_off', arg: '' };

  // bare text → treat as draft payload (founder convenience)
  return { action: 'draft', arg: rest };
}

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
      '\n\n/echo draft <message to answer as you>\n' +
      '/echo sample <paste your real sentence>\n' +
      '/echo teach <style rule>\n' +
      '/echo on|off',
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
    return { text: '🪞 Auto-assist ON (drafts only for founder)' };
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
        text:
          'Usage: /echo draft <the message you want a reply to>\n' +
          'Example: /echo draft Hello from twin',
      };
    }
    const styleBlock = (st.samples || []).slice(-15).join('\n- ');
    const system =
      'You are Echo X, the founder digital twin for PasiyaOS.\n' +
      'CRITICAL RULES:\n' +
      '1) Write ONLY the reply the founder would send.\n' +
      '2) The reply MUST address the specific incoming message below.\n' +
      '3) NEVER output a generic greeting (Hi!, Hello!, How can I help?) unless the incoming message is only a greeting.\n' +
      '4) Match tone from style samples.\n' +
      'Style samples:\n- ' +
      (styleBlock || 'Direct, practical, no fluff.');

    const userPrompt =
      'INCOMING MESSAGE TO ANSWER (reply to this exact content):\n' +
      '"""\n' +
      arg +
      '\n"""\n\n' +
      'Write the founder\'s reply now. One message only. No preamble.';

    const r = await powerChat(userPrompt, {
      system,
      temperature: 0.4,
      maxTokens: 900,
    });
    if (!r.ok) {
      return {
        text:
          'Echo draft failed: ' +
          (r.error || '') +
          '\n' +
          (r.tried || []).join('\n'),
      };
    }
    // Guard: if model still emitted only a greeting while input was not a greeting
    const out = r.text.trim();
    const generic = /^(hi|hello|hey|ayubowan|ආයුබෝවන්)[\s!.]*$/i.test(out);
    const inputIsGreeting = /^(hi|hello|hey|ayubowan|ආයුබෝවන්)\b/i.test(arg);
    if (generic && !inputIsGreeting) {
      const r2 = await powerChat(
        'Your previous reply was a useless generic greeting. Try again.\n' +
          'Answer THIS message properly:\n"""' +
          arg +
          '"""',
        { system, temperature: 0.3, maxTokens: 900 }
      );
      if (r2.ok) {
        return { text: '🪞 ECHO DRAFT · ' + r2.engine + '\n\n' + r2.text };
      }
    }
    return { text: '🪞 ECHO DRAFT · ' + r.engine + ' · ' + (r.model || '') + '\n\n' + out };
  }

  return echoStatus(ctx, supabase);
}

export default { echoCommand, echoStatus, parseEcho };
