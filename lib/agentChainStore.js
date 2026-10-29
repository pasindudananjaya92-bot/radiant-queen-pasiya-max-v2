/**
 * agentChainStore.js — Agent-5 persistent pause/chain state (Supabase)
 * Fallback: in-memory Map if Supabase unavailable.
 */

const MEM = globalThis.__pasiyaAgentChainsMem || (globalThis.__pasiyaAgentChainsMem = new Map());

function sb() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    '';
  if (!url || !key) return null;
  return { url: url, key: key };
}

async function rest(path, opts) {
  const s = sb();
  if (!s) return null;
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: (opts && opts.method) || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: (opts && opts.prefer) || 'return=representation',
    },
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json && (json.message || json.error || json.hint)) ||
      text.slice(0, 200) ||
      'HTTP ' + res.status;
    throw new Error(String(msg));
  }
  return json;
}

export async function loadChain(userId) {
  const uid = String(userId || '');
  if (!uid) return null;
  try {
    const rows = await rest(
      'rq_agent_chains?user_id=eq.' + encodeURIComponent(uid) + '&select=state,updated_at&limit=1'
    );
    if (rows && rows[0] && rows[0].state) {
      const st = rows[0].state;
      const updated = new Date(rows[0].updated_at || 0).getTime();
      // 30 min TTL
      if (Date.now() - updated > 30 * 60 * 1000) {
        await clearChain(uid);
        return null;
      }
      return st;
    }
  } catch (_) {
    /* table missing or network — mem fallback */
  }
  const m = MEM.get(uid);
  if (!m) return null;
  if (Date.now() - (m.at || 0) > 30 * 60 * 1000) {
    MEM.delete(uid);
    return null;
  }
  return m.state || null;
}

export async function saveChain(userId, state) {
  const uid = String(userId || '');
  if (!uid) return;
  const payload = state || {};
  MEM.set(uid, { state: payload, at: Date.now() });
  try {
    await rest('rq_agent_chains?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        user_id: uid,
        state: payload,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (_) {
    /* mem only */
  }
}

export async function clearChain(userId) {
  const uid = String(userId || '');
  if (!uid) return;
  MEM.delete(uid);
  try {
    await rest('rq_agent_chains?user_id=eq.' + encodeURIComponent(uid), {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  } catch (_) {}
}

export default { loadChain, saveChain, clearChain };
