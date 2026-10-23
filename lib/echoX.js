/**
 * Project Echo X — Predictive Digital Twin (founder-only)
 * Learns tone from samples + neural memory hints; drafts / optional auto-assist.
 * Does NOT silently message strangers — safety first.
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

/** Load style samples from pasiya_fs or default */
async function loadStyle(supabase) {
  if (!supabase) {
    return {
      samples: [
        'Direct, practical, Sinhala+English mix when natural.',
        'Prefers surgical patches, quality over speed, founder-only heavy features.',
      ],
      enabled: false,
    };
  }
  try {
    const { data } = await supabase
      .from('pasiya_fs')
      .select('content')
      .eq('path', '/Documents/echo-x-style.json')
      .maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return { samples: [], enabled: false, autoAssist: false };
}

async function saveStyle(supabase, style) {
  if (!supabase) return false;
  const content = JSON.stringify(style, null, 2);
  const path = '/Documents/echo-x-style.json';
  const { data: existing } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (existing?.id) {
    await supabase.from('pasiya_fs').update({ content, updated_at: new Date().toISOString() }).eq('path', path);
  } else {
    await supabase.from('pasiya_fs').insert({
      path,
      type: 'file',
      content,
      size: content.length,
    });
  }
  return true;
}

export async function echoStatus(ctx, supabase) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  const st = await loadStyle(supabase);
  return {
    text:
      '🪞 ECHO X · Digital Twin\n' +
      'enabled: ' +
      (st.enabled ? 'ON' : 'OFF') +
      '\nautoAssist: ' +
      (st.autoAssist ? 'ON' : 'OFF') +
      '\nsamples: ' +
      (st.samples?.length || 0) +
      '\n\nCommands:\n/echo on|off\n/echo sample <text>\n/echo draft <message to answer>\n/echo teach <style note>',
  };
}

export async function echoCommand(ctx, supabase, text) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  const raw = String(text || '').replace(/^\/echo(@\w+)?\s*/i, '').trim();
  const st = await loadStyle(supabase);

  if (!raw || raw === 'status') return echoStatus(ctx, supabase);

  if (raw === 'on') {
    st.enabled = true;
    await saveStyle(supabase, st);
    return { text: '🪞 Echo X ON — draft mode ready. Auto-reply to strangers stays OFF unless /echo auto on.' };
  }
  if (raw === 'off') {
    st.enabled = false;
    st.autoAssist = false;
    await saveStyle(supabase, st);
    return { text: '🪞 Echo X OFF' };
  }
  if (raw === 'auto on') {
    st.autoAssist = true;
    st.enabled = true;
    await saveStyle(supabase, st);
    return { text: '🪞 Auto-assist ON (still founder-gated; twin drafts for you only).' };
  }
  if (raw === 'auto off') {
    st.autoAssist = false;
    await saveStyle(supabase, st);
    return { text: '🪞 Auto-assist OFF' };
  }

  if (raw.startsWith('sample ')) {
    const s = raw.slice(7).trim();
    st.samples = st.samples || [];
    st.samples.push(s);
    if (st.samples.length > 30) st.samples = st.samples.slice(-30);
    await saveStyle(supabase, st);
    return { text: '🪞 Sample saved (' + st.samples.length + ' total)' };
  }
  if (raw.startsWith('teach ')) {
    const s = raw.slice(6).trim();
    st.samples = st.samples || [];
    st.samples.push('[STYLE] ' + s);
    await saveStyle(supabase, st);
    return { text: '🪞 Style note saved' };
  }
  if (raw.startsWith('draft ')) {
    const msg = raw.slice(6).trim();
    const styleBlock = (st.samples || []).slice(-12).join('\n- ');
    const r = await powerChat(
      'Incoming message to answer:\n"""' + msg + '"""\n\nWrite the founder\'s reply only.',
      {
        system:
          'You are the founder\'s digital twin (Echo X). Match their voice.\nStyle samples:\n- ' +
          (styleBlock || 'Direct, practical, bilingual SI/EN ok.'),
        temperature: 0.5,
        maxTokens: 800,
      }
    );
    if (!r.ok) return { text: 'Echo draft failed: ' + (r.error || '') + '\n' + (r.tried || []).join('\n') };
    return {
      text: '🪞 ECHO DRAFT · ' + r.engine + '\n\n' + r.text,
    };
  }

  return echoStatus(ctx, supabase);
}

export default { echoCommand, echoStatus };
