/**
 * agentPending.js — Agent-7 persistent confirm actions (deploy, etc.)
 */
const MEM = globalThis.__pasiyaAgentPendingMem || (globalThis.__pasiyaAgentPendingMem = new Map());

function sb() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
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
  if (!res.ok) throw new Error(String((json && json.message) || text.slice(0, 180) || res.status));
  return json;
}

export async function setPendingAction(userId, action, payload) {
  const uid = String(userId || '');
  if (!uid || !action) return;
  const row = {
    user_id: uid,
    action: String(action),
    payload: payload || {},
    updated_at: new Date().toISOString(),
  };
  MEM.set(uid, { ...row, at: Date.now() });
  try {
    await rest('rq_agent_pending?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: row,
    });
  } catch (_) {}
}

export async function takePendingAction(userId) {
  const uid = String(userId || '');
  if (!uid) return null;
  let action = null;
  let payload = {};
  try {
    const rows = await rest(
      'rq_agent_pending?user_id=eq.' +
        encodeURIComponent(uid) +
        '&select=action,payload,updated_at&limit=1'
    );
    if (rows && rows[0]) {
      const updated = new Date(rows[0].updated_at || 0).getTime();
      if (Date.now() - updated <= 15 * 60 * 1000) {
        action = rows[0].action;
        payload = rows[0].payload || {};
      }
      await rest('rq_agent_pending?user_id=eq.' + encodeURIComponent(uid), {
        method: 'DELETE',
        prefer: 'return=minimal',
      });
    }
  } catch (_) {
    const m = MEM.get(uid);
    if (m && Date.now() - (m.at || 0) <= 15 * 60 * 1000) {
      action = m.action;
      payload = m.payload || {};
    }
  }
  MEM.delete(uid);
  return action ? { action: action, payload: payload } : null;
}

export async function clearPendingAction(userId) {
  const uid = String(userId || '');
  MEM.delete(uid);
  try {
    await rest('rq_agent_pending?user_id=eq.' + encodeURIComponent(uid), {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  } catch (_) {}
}

export async function listMacros() {
  try {
    const rows = await rest('rq_agent_macros?select=name,description,steps&order=name.asc');
    return rows || [];
  } catch (_) {
    return [
      {
        name: 'seal-check',
        description: 'healcheck then seal',
        steps: [
          { id: 'healcheck', args: {}, label: 'Healcheck' },
          { id: 'seal', args: {}, label: 'Seal v5000' },
        ],
      },
      {
        name: 'repo-seal',
        description: 'repo status then seal',
        steps: [
          { id: 'repo_status', args: {}, label: 'Repo status' },
          { id: 'seal', args: {}, label: 'Seal v5000' },
        ],
      },
    ];
  }
}

export async function getMacro(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  try {
    const rows = await rest(
      'rq_agent_macros?name=eq.' + encodeURIComponent(n) + '&select=name,description,steps&limit=1'
    );
    if (rows && rows[0]) return rows[0];
  } catch (_) {}
  const all = await listMacros();
  return all.find(function (m) {
    return String(m.name).toLowerCase() === n;
  }) || null;
}

export default {
  setPendingAction: setPendingAction,
  takePendingAction: takePendingAction,
  clearPendingAction: clearPendingAction,
  listMacros: listMacros,
  getMacro: getMacro,
};
