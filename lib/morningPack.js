// Phase 7 — Merged Morning Pack (Shadow + Health + Bank + optional Weather)
// One beautiful text + voice briefing for the Founder.

function founderChatId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean)[0];
}

async function tgSend(chatId, text) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: 'no token/chat' };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) {
    // plain fallback
    const res2 = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).replace(/[*_`]/g, '').slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j2 = await res2.json().catch(() => ({}));
    return { ok: !!j2.ok, error: j2.description };
  }
  return { ok: true };
}

async function sectionHealth() {
  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.getHealth || h.checkAll;
    if (typeof fn !== 'function') return '🟢 Health: module present';
    const r = await fn();
    const checks = r.checks || r.results || [];
    if (Array.isArray(checks) && checks.length) {
      const lines = checks.slice(0, 8).map((c) => {
        const ok = c.ok !== false && c.status !== 'down';
        return `${ok ? '✅' : '❌'} ${c.name || c.id || 'svc'}${c.ms != null ? ` · ${c.ms}ms` : ''}`;
      });
      return ['🩺 *System Health*', ...lines].join('\n');
    }
    return `🩺 *System Health*\n${r.summary || r.text || JSON.stringify(r).slice(0, 400)}`;
  } catch (e) {
    return `🩺 *System Health*\n⚠️ ${e.message || e}`;
  }
}

async function sectionShadow() {
  try {
    const sm = await import('./shadowManager.js');
    const list = await sm.listTasks({ status: 'pending', limit: 12 });
    if (!list?.length) return '🌑 *Shadow*\nNo pending tasks.';
    const lines = list.map((t, i) => `${i + 1}. ${t.raw_text || t.text || '—'}`);
    return ['🌑 *Shadow Tasks*', ...lines].join('\n');
  } catch (e) {
    return `🌑 *Shadow*\n⚠️ ${e.message || e}`;
  }
}

async function sectionBank() {
  try {
    const b = await import('./bankManager.js');
    const sum = await b.summary(7);
    const txs = await b.listTransactions(3);
    const lines = [
      '🏦 *Bank (7d)*',
      `Total: Rs.${Number(sum.total || 0).toLocaleString()} · ${sum.count || 0} txs`,
    ];
    for (const t of txs || []) {
      lines.push(`· Rs.${t.amount} ${t.merchant || t.note || ''} (${t.category})`);
    }
    return lines.join('\n');
  } catch (e) {
    return `🏦 *Bank*\n—`;
  }
}

async function sectionWeather() {
  try {
    if (String(process.env.MORNING_WEATHER || '1') === '0') return '';
    const ws = await import('./webSearch.js');
    const fn = ws.webSearch || ws.search || ws.tavilySearch;
    if (typeof fn !== 'function') return '';
    const q = process.env.MORNING_WEATHER_QUERY || 'Colombo Sri Lanka weather today';
    const r = await fn(q);
    const text =
      typeof r === 'string'
        ? r
        : r?.answer || r?.text || (r?.results || []).slice(0, 2).map((x) => x.content || x.snippet).join(' ');
    if (!text) return '';
    return `🌤 *Weather*\n${String(text).slice(0, 350)}`;
  } catch (_) {
    return '';
  }
}

export async function buildMergedMorningText() {
  const [health, shadow, bank, weather] = await Promise.all([
    sectionHealth(),
    sectionShadow(),
    sectionBank(),
    sectionWeather(),
  ]);
  const date = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });
  const parts = [
    `👑 *Queen OS · Morning Pack*`,
    `📅 ${date}`,
    `────────────────`,
    health,
    `────────────────`,
    shadow,
    `────────────────`,
    bank,
  ];
  if (weather) {
    parts.push(`────────────────`, weather);
  }
  parts.push(`────────────────`, `_Have a strong day, Founder._`);
  return parts.filter(Boolean).join('\n');
}

/**
 * Full morning: merged text → Telegram → optional voice → complete shadow tasks.
 */
export async function runMergedMorning({ sendTelegram = true, voice = true } = {}) {
  const text = await buildMergedMorningText();
  const uid = founderChatId();
  let send = { ok: false };
  let voiceResult = null;

  if (sendTelegram && uid) {
    send = await tgSend(uid, text);
  }

  // Complete pending shadow tasks via existing manager (marks done + report)
  try {
    const sm = await import('./shadowManager.js');
    await sm.runMorningReport({ sendTelegram: false });
  } catch (_) {}

  if (voice && sendTelegram && uid && String(process.env.NIGHT_VOICE || '1') !== '0') {
    try {
      const tts = await import('./ttsManager.js');
      const speak = tts.speakBriefing || tts.speakText;
      if (typeof speak === 'function') {
        const script = String(text)
          .replace(/[*_`#]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);
        const audio = await speak(script, 'female');
        if (audio?.ok && audio.buffer) {
          const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
          const form = new FormData();
          form.append('chat_id', uid);
          form.append('caption', '🎙 Morning Pack');
          form.append(
            'voice',
            new Blob([audio.buffer], { type: 'audio/ogg' }),
            'morning.ogg'
          );
          const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(12000),
          });
          const j = await res.json().catch(() => ({}));
          voiceResult = { ok: !!j.ok, error: j.description };
        } else {
          voiceResult = { ok: false, error: audio?.error || 'tts failed' };
        }
      }
    } catch (e) {
      voiceResult = { ok: false, error: e.message || String(e) };
    }
  }

  return {
    ok: true,
    text,
    send,
    voice: voiceResult,
  };
}


/** Email the merged morning pack via Resend */
export async function emailMorningPack() {
  const text = await buildMergedMorningText();
  const plain = String(text).replace(/[*_`]/g, '');
  const m = await import('./mailManager.js');
  return m.sendEmail({
    subject: 'Queen OS — Morning Pack',
    text: plain,
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.45">${plain
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`,
  });
}
