/**
 * Shadow Twin — founder draft queue (not auto-public post)
 * /shadow draft <text>
 * /shadow list
 * /shadow send <id-prefix>  → DM founder via bot
 * /shadow schedule <iso|minutes> | <text>  (stores scheduled_for)
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(path, opts = {}) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

async function telegramSend(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) throw new Error('BOT_TOKEN/chat missing');
  await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) }),
  });
}

export async function handleShadow(text, ctx) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const body = raw.replace(/^\/shadow\s*/i, '').trim();
  const [action, ...rest] = body.split(/\s+/);
  const a = (action || 'help').toLowerCase();
  const arg = rest.join(' ').trim();

  if (a === 'help' || !action) {
    return (
      '👤 SHADOW TWIN\n' +
      '/shadow draft <text> — save draft\n' +
      '/shadow list — recent drafts\n' +
      '/shadow send <id> — DM you the draft now\n' +
      '/shadow schedule 30m | <text> — schedule (minutes)\n' +
      'Drafts stay private (founder only). Not public social posts.'
    );
  }

  if (a === 'draft') {
    if (!arg) return 'Usage: /shadow draft <text>';
    const ins = await rest('rq_shadow_drafts', {
      method: 'POST',
      body: JSON.stringify({
        title: arg.slice(0, 60),
        body: arg,
        status: 'draft',
      }),
    });
    const row = Array.isArray(ins) ? ins[0] : ins;
    return '✅ Draft saved `' + String(row?.id || '').slice(0, 8) + '`';
  }

  if (a === 'list') {
    const rows = await rest(
      'rq_shadow_drafts?order=created_at.desc&limit=10&select=id,title,status,scheduled_for,created_at'
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return 'No drafts.';
    return (
      '👤 DRAFTS\n' +
      list
        .map(
          (r, i) =>
            i +
            1 +
            '. `' +
            String(r.id).slice(0, 8) +
            '` · ' +
            (r.status || '') +
            '\n   ' +
            String(r.title || '').slice(0, 80)
        )
        .join('\n')
    );
  }

  if (a === 'send') {
    const id = arg.trim();
    if (!id) return 'Usage: /shadow send <id-prefix>';
    const all = await rest(
      'rq_shadow_drafts?order=created_at.desc&limit=20&select=*'
    );
    const row = (Array.isArray(all) ? all : []).find((r) =>
      String(r.id).startsWith(id)
    );
    if (!row) return 'Draft not found';
    await telegramSend(ADMIN(), '👤 Shadow Twin\n\n' + row.body);
    await rest('rq_shadow_drafts?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'sent',
        sent_at: new Date().toISOString(),
      }),
    });
    return '✅ Sent to founder DM';
  }

  if (a === 'schedule') {
    // /shadow schedule 30m | text here
    const m = arg.match(/^(\d+)\s*m(?:in(?:utes)?)?\s*\|\s*([\s\S]+)$/i);
    if (!m) return 'Usage: /shadow schedule 30m | draft text here';
    const mins = Number(m[1]);
    const draft = m[2].trim();
    const when = new Date(Date.now() + mins * 60 * 1000).toISOString();
    const ins = await rest('rq_shadow_drafts', {
      method: 'POST',
      body: JSON.stringify({
        title: draft.slice(0, 60),
        body: draft,
        status: 'scheduled',
        scheduled_for: when,
      }),
    });
    const row = Array.isArray(ins) ? ins[0] : ins;
    return (
      '✅ Scheduled `' +
      String(row?.id || '').slice(0, 8) +
      '` for ' +
      when +
      '\n(Deliver via /shadow due or Hull B cron later)'
    );
  }

  if (a === 'due') {
    const now = new Date().toISOString();
    const rows = await rest(
      'rq_shadow_drafts?status=eq.scheduled&scheduled_for=lte.' +
        encodeURIComponent(now) +
        '&order=scheduled_for.asc&limit=5&select=*'
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return 'No due drafts.';
    let n = 0;
    for (const row of list) {
      await telegramSend(ADMIN(), '👤 Shadow Twin (due)\n\n' + row.body);
      await rest('rq_shadow_drafts?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({
          status: 'sent',
          sent_at: new Date().toISOString(),
        }),
      });
      n++;
    }
    return '✅ Delivered ' + n + ' scheduled draft(s)';
  }

  return 'Unknown. /shadow help';
}

export default { handleShadow };
