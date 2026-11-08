// lib/nightOperator.js
// Agent-26 — Night Operator (autonomous overnight + morning briefing)
// Version: 2026-11-05
// Triggers:
//   /api/cron?job=nightscan&secret=CRON_SECRET     → 02:00 collect + optional heal
//   /api/cron?job=morningbrief&secret=CRON_SECRET  → 07:00 deliver text + voice
//   /api/cron?job=nightops&secret=...&phase=scan|brief

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderChatId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || process.env.NIGHT_CHAT_ID || '').trim();
}

async function tgSend(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: 'no token/chat' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 3900),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.ok, error: j.description };
}

async function tgVoice(chatId, buffer, caption = '') {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId || !buffer) return { ok: false };
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('voice', new Blob([buffer], { type: 'audio/mpeg' }), 'briefing.mp3');
  if (caption) form.append('caption', String(caption).slice(0, 200));
  const r = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
    method: 'POST',
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.ok, error: j.description };
}

export async function getVoicePref(uid) {
  const client = sb();
  if (!client) return true;
  try {
    const { data } = await client
      .from('rq_user_prefs')
      .select('voice_replies')
      .eq('user_id', String(uid))
      .maybeSingle();
    if (data && typeof data.voice_replies === 'boolean') return data.voice_replies;
  } catch (_) {}
  return String(process.env.NIGHT_VOICE || '1') !== '0';
}

export async function setVoicePref(uid, on) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client.from('rq_user_prefs').upsert({
    user_id: String(uid),
    voice_replies: !!on,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return !!on;
}

async function checkHealthSnapshot() {
  const checks = [];
  // Vercel
  checks.push({
    name: 'Vercel',
    ok: Boolean(process.env.VERCEL || process.env.VERCEL_URL),
    detail: process.env.VERCEL_ENV || (process.env.VERCEL ? 'running' : 'unknown'),
  });
  // Supabase
  try {
    const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!url || !key) checks.push({ name: 'Supabase', ok: false, detail: 'missing env' });
    else {
      const t0 = Date.now();
      const r = await fetch(url + '/rest/v1/', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(8000),
      });
      const ok = r.status !== 401 && r.status !== 403 && r.status > 0;
      checks.push({ name: 'Supabase', ok, detail: `${r.status} · ${Date.now() - t0}ms` });
    }
  } catch (e) {
    checks.push({ name: 'Supabase', ok: false, detail: e.message || 'error' });
  }
  // Make
  const make = process.env.MAKE_WEBHOOK_URL || '';
  checks.push({
    name: 'Make Webhook',
    ok: make.startsWith('http'),
    detail: make.startsWith('http') ? 'configured' : 'missing',
  });
  // Snap / cron keys present
  checks.push({
    name: 'SnapDeploy',
    ok: Boolean(process.env.SNAPDEPLOY_API_KEY),
    detail: process.env.SNAPDEPLOY_API_KEY ? 'key present' : 'no key',
  });
  checks.push({
    name: 'cron-job.org',
    ok: Boolean(process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY),
    detail: process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY ? 'key present' : 'no key',
  });
  return checks;
}

async function trySnapSelfHeal() {
  const result = { attempted: false, steps: [], error: null };
  if (!process.env.SNAPDEPLOY_API_KEY) return result;
  try {
    const snap = await import('./snapDeployManager.js');
    const list = await (snap.listApps?.() || snap.listContainers?.() || (() => ({ containers: [] }))());
    const containers = list.containers || list.apps || list.items || [];
    if (!Array.isArray(containers) || !containers.length) {
      result.detail = 'no containers';
      return result;
    }
    for (const c of containers.slice(0, 5)) {
      const id = c.containerId || c.id || c.name;
      const status = String(c.status || c.state || '').toUpperCase();
      const unhealthy =
        /STOP|SLEEP|IDLE|503|DOWN|ERROR|FAIL/i.test(status) ||
        c.healthy === false;
      if (!unhealthy && !process.env.NIGHT_HEAL_ALWAYS) continue;
      result.attempted = true;
      if (typeof snap.healContainer === 'function') {
        const h = await snap.healContainer(id);
        result.steps.push({ id, heal: h });
      } else {
        try {
          if (snap.wakeContainer) await snap.wakeContainer(id);
          result.steps.push({ id, action: 'wake' });
        } catch (e) {
          result.steps.push({ id, action: 'wake', error: e.message });
        }
        try {
          if (snap.restartContainer) await snap.restartContainer(id);
          result.steps.push({ id, action: 'restart' });
        } catch (e) {
          result.steps.push({ id, action: 'restart', error: e.message });
        }
      }
    }
  } catch (e) {
    result.error = e.message || String(e);
  }
  return result;
}

async function collectDayActivity(uid) {
  const client = sb();
  const out = { memories: [], documents: [], memCount: 0, docCount: 0 };
  if (!client) return out;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const { data: mems } = await client
      .from('rq_memories')
      .select('id, content, created_at')
      .eq('user_id', String(uid))
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8);
    out.memories = mems || [];
    out.memCount = out.memories.length;
  } catch (_) {}
  try {
    const { data: docs } = await client
      .from('rq_documents')
      .select('id, title, filename, char_count, created_at')
      .eq('user_id', String(uid))
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8);
    out.documents = docs || [];
    out.docCount = out.documents.length;
  } catch (_) {}
  return out;
}

function formatBriefing({ checks, heal, activity, ts }) {
  const lines = [];
  lines.push('🌙 *Night Operator — Morning Briefing*');
  lines.push(`_${ts}_`);
  lines.push('');
  lines.push('*System health*');
  for (const c of checks || []) {
    lines.push(`${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }
  lines.push('');
  if (heal?.attempted) {
    lines.push('*Self-heal*');
    lines.push(`Attempts: ${(heal.steps || []).length}`);
    if (heal.error) lines.push(`Error: ${heal.error}`);
    for (const s of (heal.steps || []).slice(0, 6)) {
      lines.push(`• ${JSON.stringify(s).slice(0, 120)}`);
    }
    lines.push('');
  } else {
    lines.push('*Self-heal*: no action needed (or Snap key missing)');
    lines.push('');
  }
  lines.push('*Last 24h activity*');
  lines.push(`Memories: ${activity?.memCount ?? 0} · Documents: ${activity?.docCount ?? 0}`);
  for (const d of (activity?.documents || []).slice(0, 4)) {
    lines.push(`📄 #${d.id} ${d.title || d.filename}`);
  }
  for (const m of (activity?.memories || []).slice(0, 3)) {
    lines.push(`🧠 ${String(m.content).slice(0, 80).replace(/\n/g, ' ')}`);
  }
  lines.push('');
  lines.push('_Commands: night report · voice on/off · health_');
  return lines.join('\n');
}

function spokenScript(briefingText) {
  // Short TTS-friendly script
  return String(briefingText || '')
    .replace(/[*_`]/g, '')
    .replace(/✅/g, 'OK ')
    .replace(/❌/g, 'FAIL ')
    .replace(/📄/g, 'Document ')
    .replace(/🧠/g, 'Memory ')
    .replace(/🌙/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

export async function runNightScan(opts = {}) {
  const uid = founderChatId();
  const checks = await checkHealthSnapshot();
  const heal = await trySnapSelfHeal();
  const activity = await collectDayActivity(uid);
  const ts = new Date().toISOString();
  const briefing = formatBriefing({ checks, heal, activity, ts });
  const payload = {
    phase: 'scan',
    ts,
    checks,
    heal,
    activity,
    briefing,
    allOk: (checks || []).every((c) => c.ok),
  };

  const client = sb();
  if (client) {
    try {
      await client.from('rq_night_reports').insert({
        user_id: String(uid || 'founder'),
        phase: 'scan',
        payload,
        briefing_text: briefing,
        created_at: ts,
      });
    } catch (e) {
      payload.storeError = e.message;
    }
  }

  // Optional: alert immediately if hard fail
  if (opts.alertOnFail && !payload.allOk && uid) {
    await tgSend(uid, '⚠️ Night scan detected issues:\n\n' + briefing.slice(0, 1500));
  }

  return payload;
}

export async function runMorningBrief(opts = {}) {
  const uid = founderChatId();
  if (!uid) return { ok: false, error: 'ADMIN_ID / FOUNDER_ID not set' };

  const cronMode = !!(opts.cron || opts.fast || opts.skipVoiceHeavy);
  const forceVoice = opts.forceVoice === true;
  const voiceTimeoutMs = Number(opts.voiceTimeoutMs || (cronMode ? 3500 : 20000));

  // Prefer last scan from DB; else run a lightweight scan
  let briefing = '';
  let payload = null;
  try {
    const client = sb();
    if (client) {
      const { data } = await client
        .from('night_reports')
        .select('briefing_text, payload, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.briefing_text) {
        briefing = data.briefing_text;
        payload = data.payload;
      }
    }
  } catch (_) {}

  if (!briefing) {
    const scan = await runNightScan({ alertOnFail: false });
    briefing = scan.briefing;
    payload = scan;
  }

  const morning = String(briefing || '')
    .replace('Night Operator — Morning Briefing', 'Night Operator — Morning Briefing (delivered)');

  // 1) TEXT FIRST — this must succeed for cron 200 OK
  const send = await tgSend(uid, morning);
  if (!send.ok) {
    return { ok: false, error: send.error || 'tg text failed', send, voiceResult: { ok: false } };
  }

  // 2) VOICE — best-effort; never fail the whole job on TTS timeout
  let voiceResult = { ok: false, skipped: true };
  const wantVoice = forceVoice || (await getVoicePref(uid));
  const allowVoice = wantVoice && opts.skipVoice !== true;

  if (allowVoice) {
    try {
      const voicePromise = (async () => {
        const { speakBriefing } = await import('./ttsManager.js');
        const spoken = spokenScript(morning);
        // Cron: short script only (faster, avoids Vercel 10s kill)
        const script = cronMode ? spoken.slice(0, 280) : spoken;
        const audio = await speakBriefing(script);
        if (audio.ok && audio.buffer) {
          return await tgVoice(uid, audio.buffer, '🎙 Morning briefing');
        }
        return { ok: false, error: audio.error || 'tts failed' };
      })();

      const timed = Promise.race([
        voicePromise,
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, error: 'voice_timeout', skipped: true }), voiceTimeoutMs)
        ),
      ]);
      voiceResult = await timed;
      if (voiceResult?.error === 'voice_timeout') {
        // Soft note in chat once — does not fail job
        try {
          await tgSend(uid, '_Voice note skipped (time limit). Text briefing is above._');
        } catch (_) {}
      }
    } catch (e) {
      voiceResult = { ok: false, error: e.message || String(e) };
    }
  }

  try {
    const client = sb();
    if (client) {
      await client.from('night_reports').insert({
        user_id: String(uid),
        phase: 'brief',
        payload: { send, voiceResult, source: payload?.ts || null, cronMode },
        briefing_text: morning,
        created_at: new Date().toISOString(),
      });
    }
  } catch (_) {}

  // Job is OK if text delivered — voice is bonus
  return { ok: true, text: morning, send, voiceResult };
}

/** Manual full cycle for testing */
export async function runNightOpsNow() {
  const scan = await runNightScan({ alertOnFail: false });
  const brief = await runMorningBrief({ forceVoice: true });
  return { scan, brief };
}

export default {
  runNightScan,
  runMorningBrief,
  runNightOpsNow,
  getVoicePref,
  setVoicePref,
};
