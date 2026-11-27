/**
 * Wave 40B — OpenRouter Tool Calling Layer
 * Additive. GODMODEAUTO OFF. Draft-safe.
 */
export const TOOL_VERSION = '40B';

export const OPENROUTER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_blueprint',
      description:
        'Create a draft project blueprint or proposal outline. Never auto-publishes or charges.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['title', 'goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_status',
      description: 'Check live station / health / funnel status. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['station', 'health', 'funnel', 'all'],
          },
        },
        required: ['scope'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Search memory / knowledge notes. Returns snippets only.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_alert',
      description:
        'Queue a draft alert for the Founder only. Never auto-sends to customers.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        },
        required: ['message'],
      },
    },
  },
];

export async function executeToolCall(name, args = {}, ctx = {}) {
  const a = args && typeof args === 'object' ? args : {};
  try {
    switch (name) {
      case 'create_blueprint':
        return await runCreateBlueprint(a);
      case 'check_status':
        return await runCheckStatus(a);
      case 'search_knowledge':
        return await runSearchKnowledge(a);
      case 'send_alert':
        return await runSendAlert(a);
      default:
        return { ok: false, error: 'unknown_tool', name };
    }
  } catch (err) {
    return {
      ok: false,
      error: 'tool_failed',
      name,
      message: String(err && err.message ? err.message : err).slice(0, 300),
    };
  }
}

async function runCreateBlueprint(a) {
  const title = String(a.title || '').trim().slice(0, 120) || 'Untitled';
  const goal = String(a.goal || '').trim().slice(0, 800);
  const notes = String(a.notes || '').trim().slice(0, 500);
  const id = 'bp_' + Date.now().toString(36);
  return {
    ok: true,
    tool: 'create_blueprint',
    draft: true,
    id,
    title,
    goal,
    notes: notes || null,
    message: 'Blueprint draft created. Review before publish. GODMODEAUTO OFF.',
  };
}

async function runCheckStatus(a) {
  const scope = String(a.scope || 'station').toLowerCase();
  const out = { ok: true, tool: 'check_status', scope };

  if (scope === 'station' || scope === 'all') {
    try {
      const st = await import('./stationEngine.js');
      if (st && typeof st.collectSnapshot === 'function') {
        out.station = await st.collectSnapshot();
      } else if (st && typeof st.buildBriefForAI === 'function') {
        out.stationBrief = await st.buildBriefForAI();
      } else if (st && typeof st.formatStatus === 'function') {
        out.stationText = await st.formatStatus();
      }
    } catch (e) {
      out.stationError = String(e.message || e).slice(0, 200);
    }
  }

  if (scope === 'health' || scope === 'all') {
    out.health = {
      openrouterTools: TOOL_VERSION,
      note: 'Lightweight presence. Use hard command health for full probe.',
    };
  }

  if (scope === 'funnel' || scope === 'all') {
    out.funnel = { note: 'See station snapshot / weblead for live leads.' };
  }

  return out;
}

async function runSearchKnowledge(a) {
  const query = String(a.query || '').trim().slice(0, 200);
  const limit = Math.min(Math.max(parseInt(a.limit, 10) || 5, 1), 10);
  if (!query) return { ok: false, error: 'empty_query' };

  // Best-effort neural / mem hooks
  try {
    const nm = await import('./neuralMemory.js').catch(() => null);
    if (nm && typeof nm.searchMemory === 'function') {
      const rows = await nm.searchMemory(query, limit);
      return { ok: true, tool: 'search_knowledge', query, results: rows || [] };
    }
  } catch (_) {}

  return {
    ok: true,
    tool: 'search_knowledge',
    query,
    limit,
    results: [],
    note: 'No indexed hits yet (or mem module not wired).',
  };
}

async function runSendAlert(a) {
  const message = String(a.message || '').trim().slice(0, 1500);
  const priority = ['low', 'normal', 'high'].includes(a.priority) ? a.priority : 'normal';
  if (!message) return { ok: false, error: 'empty_message' };
  return {
    ok: true,
    tool: 'send_alert',
    draft: true,
    priority,
    message,
    note: 'Draft for Founder only. Not sent to customers. GODMODEAUTO OFF.',
  };
}

export async function runToolCallsFromMessage(assistantMessage, ctx = {}) {
  const calls = assistantMessage && assistantMessage.tool_calls;
  if (!Array.isArray(calls) || !calls.length) return [];

  const results = [];
  for (const tc of calls) {
    const id = tc.id || 'call_' + Math.random().toString(36).slice(2, 9);
    const name = (tc.function && tc.function.name) || '';
    let args = {};
    try {
      args = JSON.parse((tc.function && tc.function.arguments) || '{}');
    } catch (_) {
      args = {};
    }
    const result = await executeToolCall(name, args, ctx);
    results.push({
      role: 'tool',
      tool_call_id: id,
      name,
      content: JSON.stringify(result),
    });
  }
  return results;
}

export function getToolsSystemNote() {
  return [
    '=== OPENROUTER TOOLS (40B) ===',
    'Available: create_blueprint, check_status, search_knowledge, send_alert.',
    'create_blueprint + send_alert = DRAFT only. Never claim published or charged.',
    'check_status + search_knowledge = read-only.',
    'GODMODEAUTO is OFF. No auto customer messages. No auto payments.',
  ].join('\n');
}
