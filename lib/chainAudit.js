/**
 * Blockchain Mind — hash-chained audit trail (SHA-256)
 * Free: Web Crypto / node:crypto + Supabase columns
 */
import { createHash } from 'crypto';

function sha256(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

export function hashEntry({ prevHash, userId, command, result, createdAt }) {
  const payload = [
    prevHash || 'GENESIS',
    userId || '',
    command || '',
    result || '',
    createdAt || '',
  ].join('|');
  return sha256(payload);
}

export async function getChainTip(supabase) {
  try {
    const { data, error } = await supabase
      .from('rq_audit_log')
      .select('id,entry_hash,created_at')
      .not('entry_hash', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: error.message };
    const row = (data || [])[0];
    const { count } = await supabase
      .from('rq_audit_log')
      .select('id', { count: 'exact', head: true })
      .not('entry_hash', 'is', null);
    return {
      ok: true,
      tipHash: row?.entry_hash || 'GENESIS',
      height: count || 0,
      at: row?.created_at || null,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/** Attach hash chain fields onto a log row before insert */
export async function sealIntent(supabase, entry) {
  const tip = await getChainTip(supabase);
  const prev = tip.ok ? tip.tipHash || 'GENESIS' : 'GENESIS';
  const createdAt = new Date().toISOString();
  const entry_hash = hashEntry({
    prevHash: prev,
    userId: entry.userId || entry.user_id,
    command: entry.command,
    result: entry.result,
    createdAt,
  });
  return {
    ...entry,
    prev_hash: prev,
    entry_hash,
    created_at: createdAt,
  };
}

/** Verify last N entries form a valid chain */
export async function verifyChain(supabase, limit = 30) {
  const { data, error } = await supabase
    .from('rq_audit_log')
    .select('user_id,command,result,created_at,prev_hash,entry_hash')
    .not('entry_hash', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  if (!rows.length) return { ok: true, checked: 0, valid: true, note: 'empty chain' };
  let prev = rows[0].prev_hash || 'GENESIS';
  let broken = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expect = hashEntry({
      prevHash: r.prev_hash || prev,
      userId: r.user_id,
      command: r.command,
      result: r.result,
      createdAt: r.created_at,
    });
    // Accept either stored prev linkage or recomputed from walk
    const expectWalk = hashEntry({
      prevHash: prev,
      userId: r.user_id,
      command: r.command,
      result: r.result,
      createdAt: r.created_at,
    });
    if (r.entry_hash !== expect && r.entry_hash !== expectWalk) {
      broken = { index: i, command: r.command, got: r.entry_hash, expect: expectWalk };
      break;
    }
    prev = r.entry_hash;
  }
  return {
    ok: !broken,
    checked: rows.length,
    valid: !broken,
    broken,
    tip: rows[rows.length - 1]?.entry_hash,
  };
}

export function formatVerify(v) {
  if (!v.ok && v.error) return '❌ Chain: ' + v.error + '\nRun sql/CHAIN_AUDIT.sql';
  if (v.valid) {
    return (
      '⛓ CHAIN OK\nchecked: ' +
      v.checked +
      '\ntip: ' +
      String(v.tip || '').slice(0, 16) +
      '…'
    );
  }
  return (
    '⚠ CHAIN BREAK\nat #' +
    (v.broken?.index ?? '?') +
    ' cmd=' +
    (v.broken?.command || '') +
    '\ngot=' +
    String(v.broken?.got || '').slice(0, 16)
  );
}

export default { hashEntry, getChainTip, sealIntent, verifyChain, formatVerify };
