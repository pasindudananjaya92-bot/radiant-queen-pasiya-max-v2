/**
 * lib/sqlCommander.js — Founder-only God Mode DB (safe layer)
 *
 * ADMIN_ID only. Never expose to public users.
 * Pipeline: parse → static blocklist → structure rules → AI safety check → backup hint → exec
 */

const BLOCK_RE = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+table\b/i,
  /\btruncate\s+/i,
  /\balter\s+system\b/i,
  /\bcreate\s+role\b/i,
  /\bdrop\s+role\b/i,
  /\bgrant\s+/i,
  /\brevoke\b/i,
  /\bcopy\s+/i,
  /\bpg_read_file\b/i,
  /\bpg_write_file\b/i,
  /\blo_import\b/i,
  /\bdblink\b/i,
  /\bexecute\s+format\b/i,
  /\bcall\s+pg_/i,
  /\bset\s+role\b/i,
  /\bset\s+session\b/i,
  /;\s*drop\b/i,
  /;\s*truncate\b/i,
];

const ALLOW_START = /^(select|with|insert|update|create\s+table|alter\s+table|create\s+index|comment\s+on|explain|analyze)\b/i;

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/```(?:sql)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

/** Split on semicolons outside quotes (simple) */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inS = false,
    inD = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    if (c === ';' && !inS && !inD) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}


/** Strip SQL line (--) and block comments outside of strings */
export function stripSqlComments(sql) {
  const s = String(sql || '');
  let out = '';
  let i = 0;
  let inS = false, inD = false, inLine = false, inBlock = false;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      i++; continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
      i++; continue;
    }
    if (!inS && !inD) {
      if (c === '-' && n === '-') { inLine = true; i += 2; continue; }
      if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    }
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    out += c;
    i++;
  }
  return out.trim();
}

export function staticValidate(sql) {
  const raw = normalizeSql(stripSqlComments(sql));
  if (!raw) return { ok: false, reason: 'empty SQL' };
  if (raw.length > 40000) return { ok: false, reason: 'SQL too long (max 40k)' };

  const statements = splitStatements(raw);
  if (statements.length > 20) return { ok: false, reason: 'max 20 statements per run' };

  for (const st of statements) {
    for (const re of BLOCK_RE) {
      if (re.test(st)) {
        return { ok: false, reason: 'BLOCKED pattern: ' + re.toString() };
      }
    }
    // DELETE must have WHERE
    if (/^\s*delete\b/i.test(st) && !/\bwhere\b/i.test(st)) {
      return { ok: false, reason: 'DELETE without WHERE blocked' };
    }
    // UPDATE must have WHERE (unless clearly limited — still require WHERE)
    if (/^\s*update\b/i.test(st) && !/\bwhere\b/i.test(st)) {
      return { ok: false, reason: 'UPDATE without WHERE blocked' };
    }
    if (!ALLOW_START.test(st) && !/^\s*delete\b/i.test(st)) {
      return {
        ok: false,
        reason:
          'Statement must start with SELECT/WITH/INSERT/UPDATE/DELETE/CREATE TABLE/ALTER TABLE/CREATE INDEX/EXPLAIN',
      };
    }
  }

  const needsConfirm = statements.some(
    (st) =>
      /^\s*(insert|update|delete|create|alter)\b/i.test(st) ||
      /^\s*select\b/i.test(st) === false
  );

  return {
    ok: true,
    sql: statements.join(';\n'),
    statements,
    needsConfirm,
    isReadOnly: statements.every((st) => /^\s*(select|with|explain|analyze)\b/i.test(st)),
  };
}

/** Optional AI second opinion — fail-closed on uncertainty for writes */
export async function aiSafetyCheck(sql, isReadOnly) {
  if (isReadOnly) return { ok: true, skipped: true, note: 'read-only — AI skip' };

  const key = process.env.GROQ_API_KEY || '';
  const orKey = process.env.OPENROUTER_API_KEY || '';
  const prompt =
    'You are a database security auditor. Answer ONLY JSON: {"safe":true|false,"reason":"..."}\n' +
    'Reject anything that could destroy data, escalate privileges, or exfiltrate secrets.\n' +
    'SQL:\n' +
    sql;

  async function ask(url, headers, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      return JSON.parse(m[0]);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  let verdict = null;
  if (key) {
    verdict = await ask(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      {
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'SQL safety auditor. JSON only.' },
          { role: 'user', content: prompt },
        ],
      }
    );
  }
  if (!verdict && orKey) {
    verdict = await ask(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: 'Bearer ' + orKey,
        'Content-Type': 'application/json',
      },
      {
        model: 'openai/gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'SQL safety auditor. JSON only.' },
          { role: 'user', content: prompt },
        ],
      }
    );
  }

  if (!verdict) {
    // fail-closed for writes if AI unavailable
    return { ok: false, reason: 'AI safety check unavailable — write blocked (fail-closed)' };
  }
  if (verdict.safe === true) return { ok: true, reason: verdict.reason || 'AI ok' };
  return { ok: false, reason: verdict.reason || 'AI marked unsafe' };
}

/**
 * Execute via Supabase RPC or raw if available.
 * Prefers a SQL function `rq_exec_sql(q text)` if present; else limited select via from().
 */
export async function executeSql(supabase, sql, isReadOnly) {
  if (!supabase) return { ok: false, error: 'Supabase client missing' };
  sql = String(sql || '').replace(/;+\s*$/g, '').trim();

  const attempts = [];
  // Try common parameter names (schema may use q / sql / query)
  for (const payload of [{ q: sql }, { sql: sql }, { query: sql }]) {
    try {
      const { data, error } = await supabase.rpc('rq_exec_sql', payload);
      if (!error) {
        return { ok: true, data, via: 'rpc:rq_exec_sql:' + Object.keys(payload)[0] };
      }
      const msg = String(error.message || error || '');
      attempts.push(Object.keys(payload)[0] + '=' + msg.slice(0, 120));
      // Non-signature errors (permission, runtime) — return immediately
      if (!/could not find|does not exist|function.*rpc|argument|parameter|schema cache/i.test(msg)) {
        return { ok: false, error: msg };
      }
    } catch (e) {
      attempts.push('throw:' + String(e?.message || e).slice(0, 100));
    }
  }

  return {
    ok: false,
    needRpc: true,
    error:
      'rq_exec_sql RPC failed (' +
      attempts.join(' | ') +
      '). Re-run SQL_GODMODE.sql (Run+Save). Expected: create function rq_exec_sql(q text).',
  };
}

export function formatResult(data, maxChars = 3500) {
  let text;
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  } catch {
    text = String(data);
  }
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…(truncated)';
  return text;
}

/** Pending confirm store (memory — serverless best-effort) */
const pending = new Map();

export function setPending(userId, payload) {
  pending.set(String(userId), { ...payload, at: Date.now() });
}

export function getPending(userId) {
  const p = pending.get(String(userId));
  if (!p) return null;
  if (Date.now() - p.at > 5 * 60 * 1000) {
    pending.delete(String(userId));
    return null;
  }
  return p;
}

export function clearPending(userId) {
  pending.delete(String(userId));
}

export default {
  staticValidate,
  aiSafetyCheck,
  executeSql,
  formatResult,
  setPending,
  getPending,
  clearPending,
};
