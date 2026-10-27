/**
 * lib/sqlCommander.js — Founder-only God Mode DB (safe layer)
 * Phase E HOTFIX: DO $$ blocks, dollar-quote split, GRANT for migrations
 * DROP TABLE/DATABASE/TRUNCATE still blocked.
 */

const BLOCK_RE = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+table\b/i,
  /\btruncate\s+/i,
  /\balter\s+system\b/i,
  /\bcreate\s+role\b/i,
  /\bdrop\s+role\b/i,
  /\bgrant\s+.*\bto\s+public\b/i,
  /\brevoke\s+.*\bfrom\s+public\b/i,
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

const ALLOW_START =
  /^(select|with|insert|update|delete|create|alter|comment\s+on|explain|analyze|do|grant|revoke|notify|listen|security)\b/i;

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/```(?:sql)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

/** Split on semicolons outside quotes and dollar-quotes ($tag$...$tag$) */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inS = false;
  let inD = false;
  let dollarTag = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (!inS && !inD) {
      if (c === '$') {
        const slice = sql.slice(i);
        const m = slice.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (m) {
          const tag = m[0];
          if (dollarTag === null) {
            dollarTag = tag;
            cur += tag;
            i += tag.length - 1;
            continue;
          } else if (tag === dollarTag) {
            dollarTag = null;
            cur += tag;
            i += tag.length - 1;
            continue;
          }
        }
      }
    }

    if (dollarTag) {
      cur += c;
      continue;
    }

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
  let inS = false,
    inD = false,
    inLine = false,
    inBlock = false;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (!inS && !inD) {
      if (c === '-' && n === '-') {
        inLine = true;
        i += 2;
        continue;
      }
      if (c === '/' && n === '*') {
        inBlock = true;
        i += 2;
        continue;
      }
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
  if (statements.length > 30) return { ok: false, reason: 'max 30 statements per run' };

  for (const st of statements) {
    for (const re of BLOCK_RE) {
      if (re.test(st)) {
        return { ok: false, reason: 'BLOCKED pattern: ' + re.toString() };
      }
    }
    if (/^\s*delete\b/i.test(st) && !/\bwhere\b/i.test(st)) {
      return { ok: false, reason: 'DELETE without WHERE blocked' };
    }
    if (/^\s*update\b/i.test(st) && !/\bwhere\b/i.test(st)) {
      return { ok: false, reason: 'UPDATE without WHERE blocked' };
    }
    if (!ALLOW_START.test(st)) {
      return {
        ok: false,
        reason:
          'Statement must start with SELECT/WITH/INSERT/UPDATE/DELETE/CREATE/ALTER/DO/GRANT/COMMENT/EXPLAIN (DROP TABLE/DATABASE/TRUNCATE still blocked)',
      };
    }
  }

  const needsConfirm = statements.some(
    (st) =>
      /^\s*(insert|update|delete|create|alter|do|grant)\b/i.test(st) ||
      /^\s*select\b/i.test(st) === false
  );

  return {
    ok: true,
    sql: statements.join(';\n'),
    statements,
    needsConfirm,
    isReadOnly: statements.every((st) =>
      /^\s*(select|with|explain|analyze)\b/i.test(st)
    ),
  };
}

export async function aiSafetyCheck(sql, isReadOnly) {
  if (isReadOnly) return { ok: true, skipped: true, note: 'read-only — AI skip' };
  try {
    const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
    if (!key) return { ok: true, skipped: true, note: 'no AI key — static only' };
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are a SQL safety checker. Reply ONLY JSON {"safe":true|false,"reason":"..."}. Block DROP DATABASE, data exfiltration, privilege escalation. Allow CREATE TABLE, CREATE INDEX, DO $$ blocks, ALTER TABLE ADD COLUMN.',
          },
          { role: 'user', content: String(sql).slice(0, 8000) },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });
    const j = await res.json().catch(() => ({}));
    const text = j.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: true, skipped: true, note: 'AI parse skip' };
    const parsed = JSON.parse(m[0]);
    if (parsed.safe === false) {
      return { ok: false, reason: parsed.reason || 'AI marked unsafe' };
    }
    return { ok: true, note: parsed.reason || 'AI ok' };
  } catch (e) {
    return { ok: true, skipped: true, note: 'AI error — allow static pass' };
  }
}

export async function executeSql(supabase, sql, isReadOnly) {
  if (!supabase) throw new Error('supabase client required');
  const v = staticValidate(sql);
  if (!v.ok) return { ok: false, error: v.reason };

  const ai = await aiSafetyCheck(v.sql, v.isReadOnly || isReadOnly);
  if (!ai.ok) return { ok: false, error: 'AI safety: ' + (ai.reason || '') };

  // Prefer RPC rq_exec_sql if present
  try {
    const { data, error } = await supabase.rpc('rq_exec_sql', { q: v.sql });
    if (error) {
      // fallback: single statements via rpc one by one
      if (v.statements.length === 1) {
        return { ok: false, error: error.message || String(error) };
      }
    } else {
      return { ok: true, data, via: 'rq_exec_sql', ai };
    }
  } catch (e) {
    /* try statement loop */
  }

  const results = [];
  for (const st of v.statements) {
    const { data, error } = await supabase.rpc('rq_exec_sql', { q: st });
    if (error) {
      return {
        ok: false,
        error: error.message || String(error),
        partial: results,
      };
    }
    results.push(data);
  }
  return { ok: true, data: results, via: 'rq_exec_sql-multi', ai };
}

export default {
  staticValidate,
  stripSqlComments,
  aiSafetyCheck,
  executeSql,
};
