/**
 * Echo X — ironclad draft (forbids generic help fallback)
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

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
    autoReply: false,
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
      return {
        samples: Array.isArray(j.samples) ? j.samples : fallback.samples,
        enabled: j.enabled !== false,
        autoReply: !!j.autoReply,
      };
    }
  } catch (_) {}
  return fallback;
}

/**
 * @param {object} ctx
 * @param {object|null} supabase
 * @param {string} [rawText] full message text e.g. "/echo draft Hello from twin"
 */
export async function echoCommand(ctx, supabase, rawText) {
  if (!isFounder(ctx)) {
    return { text: '👑 Founder-only.' };
  }
  const text = String(
    rawText || ctx?.message?.text || ctx?.message?.caption || ''
  ).trim();
  const body = text
    .replace(/^\/echo(?:@\w+)?\s*/i, '')
    .trim();

  // /echo help | (empty)
  if (!body || /^(help|status)$/i.test(body)) {
    return {
      text:
        '🪞 ECHO X\n' +
        '/echo draft <text> — write in founder voice\n' +
        '/echo <text> — same as draft\n' +
        'Ironclad: no generic "How can I help you today?" fallback.',
    };
  }

  let prompt = body;
  const draftMatch = body.match(/^draft\s+([\s\S]+)/i);
  if (draftMatch) prompt = draftMatch[1].trim();

  const style = await loadStyle(supabase);
  const system =
    'You are Echo X, the founder digital twin for PasiyaOS.\n' +
    'RULES (non-negotiable):\n' +
    '1. NEVER reply with a generic greeting like "How can I help you today?" or "Hello! I\'m Echo X".\n' +
    '2. If the user gives a phrase to draft (e.g. "Hello from twin"), produce a useful short reply IN CHARACTER that acknowledges that phrase and asks a concrete next step (patch, task, or command).\n' +
    '3. Keep replies under 4 sentences unless asked for more.\n' +
    '4. Style notes:\n- ' +
    (style.samples || []).slice(0, 6).join('\n- ') +
    '\n5. Output ONLY the draft text, no markdown fences, no preamble.';

  const r = await powerChat(
    'Draft now for this input:\n' + prompt,
    { system, maxTokens: 400, temperature: 0.4 }
  );

  let out = (r && r.ok && r.text ? String(r.text).trim() : '') || '';
  // Strip banned generic fallbacks
  if (
    !out ||
    /how can i help you today/i.test(out) ||
    /^hello[!.,\s]*i['']?m echo/i.test(out)
  ) {
    out =
      prompt.slice(0, 120) +
      (prompt.length > 120 ? '…' : '') +
      ' — received. What patch or task should Echo run next?';
  }

  return { text: out, engine: r?.engine || 'local' };
}

export async function handleEcho({ text, ctx, supabase }) {
  const r = await echoCommand(ctx, supabase, text);
  return r.text;
}

export default { echoCommand, handleEcho };
