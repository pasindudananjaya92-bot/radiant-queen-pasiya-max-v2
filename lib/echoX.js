```js
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

async function