/**
 * Error DNA — recurring failure fingerprints (founder observability)
 * Does NOT auto-patch. Logs + rank only.
 */
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
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: String(text).slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

export function fingerprint(message, filePath = '', command = '') {
  const m = String(message || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{3,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
    .toLowerCase();
  return [command || '', filePath || '', m].join('|').slice(0, 400);
}

export async function recordErrorDna({
  message,
  filePath = '',
  command = '',
  stack = '',
  status = 'open',
  meta = {},
}) {
  const fp = fingerprint(message, filePath, command);
  const existing = await rest(
    'rq_error_dna?fingerprint=eq.' +
      encodeURIComponent(fp) +
      '&select=id,count&limit=1'
  ).catch(() => []);
  if (Array.isArray(existing) && existing[0]) {
    const id = existing[0].id;
    const count = Number(existing[0].count || 1) + 1;
    await rest('rq_error_dna?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        count,
        last_seen: new Date().toISOString(),
        last_status: status,
        message: String(message || '').slice(0, 500),
        stack_snippet: String(stack || '').slice(0, 800),
        meta,
      }),
    });
    return { ok: true, fingerprint: fp, count, id };
  }
  const row = {
    fingerprint: fp,
    command: command || null,
    file_path: filePath || null,
    message: String(message || '').slice(0, 500),
    stack_snippet: String(stack || '').slice(0, 800),
    count: 1,
    last_status: status,
    meta,
  };
  const ins = await rest('rq_error_dna', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify(row),
  });
  const id = Array.isArray(ins) ? ins[0]?.id : ins?.id;
  return { ok: true, fingerprint: fp, count: 1, id };
}

export async function listErrorDna({ limit = 12, q = '' } = {}) {
  let path =
    'rq_error_dna?order=count.desc,last_seen.desc&limit=' +
    Math.min(30, limit) +
    '&select=id,fingerprint,command,file_path,message,count,last_seen,last_status';
  if (q) {
    path +=
      '&or=(message.ilike.*' +
      encodeURIComponent(q) +
      '*,command.ilike.*' +
      encodeURIComponent(q) +
      '*,file_path.ilike.*' +
      encodeURIComponent(q) +
      '*)';
  }
  const rows = await rest(path);
  return Array.isArray(rows) ? rows : [];
}

export function formatErrorDna(rows) {
  if (!rows?.length) return '🧬 ERROR DNA\nNo patterns yet. Failures auto-log when wired.';
  return (
    '🧬 ERROR DNA (top ' +
    rows.length +
    ')\n' +
    rows
      .map((r, i) => {
        return (
          i +
          1 +
          '. ×' +
          (r.count || 1) +
          ' · ' +
          (r.command || '-') +
          '\n   ' +
          String(r.message || '').slice(0, 90) +
          '\n   ' +
          (r.file_path || '') +
          ' · ' +
          String(r.last_status || '')
        );
      })
      .join('\n')
  );
}

export async function handleErrorDnaCmd(text) {
  const raw = String(text || '').trim();
  const arg = raw.replace(/^\/errordna\s*/i, '').trim();
  if (!arg || arg === 'list' || arg === 'top') {
    const rows = await listErrorDna({ limit: 12 });
    return formatErrorDna(rows);
  }
  if (arg.startsWith('search ')) {
    const q = arg.slice(7).trim();
    const rows = await listErrorDna({ limit: 12, q });
    return formatErrorDna(rows);
  }
  if (arg.startsWith('log ')) {
    const message = arg.slice(4).trim();
    const r = await recordErrorDna({ message, command: '/errordna' });
    return '✅ DNA logged · count=' + r.count + '\n`' + r.fingerprint.slice(0, 80) + '`';
  }
  return (
    '🧬 ERROR DNA\n' +
    '/errordna — top patterns\n' +
    '/errordna search <q>\n' +
    '/errordna log <message>\n' +
    '(Auto-record hooks optional; this command is founder-only.)'
  );
}

/** Call from route catch blocks — never throws */
export async function autoLogError(err, command = '', filePath = '') {
  try {
    const message = err && err.message ? err.message : String(err || 'unknown');
    const stack = err && err.stack ? err.stack : '';
    return await recordErrorDna({
      message,
      stack,
      command: String(command || '').slice(0, 80),
      filePath: String(filePath || '').slice(0, 120),
      status: 'open',
      meta: { source: 'auto' },
    });
  } catch (_) {
    return { ok: false };
  }
}

export default {
  fingerprint,
  recordErrorDna,
  handleErrorDnaCmd,
  autoLogError,
};
