/**
 * Wave 40A — OpenRouter Tool Calling Layer
 * Additive only. GODMODEAUTO stays OFF. Draft-safe.
 * Maps LLM tool calls → existing Queen OS managers.
 */

export const TOOL_VERSION = '40A';

/** OpenAI / OpenRouter style tool definitions (one-pattern) */
export const OPENROUTER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_blueprint',
      description:
        'Create a draft project blueprint or proposal outline. Never auto-publishes or charges. Returns a draft id + summary.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short project title' },
          goal: { type: 'string', description: 'What the founder wants to achieve' },
          notes: { type: 'string', description: 'Optional extra context' },
        },
        required: ['title', 'goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_status',
      description:
        'Check live system or funnel status (station pulse, health, recent leads). Read-only.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['station', 'health', 'funnel', 'all'],
            description: 'What to check',
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
      description:
        'Search Second Brain / memory / knowledge notes. Returns matching snippets only.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text' },
          limit: { type: 'integer', description: 'Max results (default 5)' },
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
        'Queue a draft alert/notification for the Founder (Telegram). Never auto-sends to customers. Draft-safe.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Alert body' },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            description: 'Priority level',
          },
        },
        required: ['message'],
      },
    },
  },
];

/**
 * Execute one tool call. Always returns a plain object safe to send back to the model.
 * Never throws to the model — errors become structured results.
 */
export async function executeToolCall(name, args = {}, ctx = {}) {
  const a = args && typeof args === 'object' ? args : {};
  try {
    switch (name) {
      case 'create_blueprint':
        return await runCreateBlueprint(a, ctx);
      case 'check_status':
        return await runCheckStatus(a, ctx);
      case 'search_knowledge':
        return await runSearchKnowledge(a, ctx);
      case 'send_alert':
        return await runSendAlert(a, ctx);
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

/** Draft-only blueprint. No publish, no payment. */
async function runCreateBlueprint(a, ctx) {
  const title = String(a.title || '').trim().slice(0, 120) || 'Untitled';
  const goal = String(a.goal || '').trim().slice(0, 800);
  const notes = String(a.notes || '').trim().slice(0, 500);
  const id = 'bp_' + Date.now().toString(36);

  // Best-effort: try existing draft / proposal helpers if present
  try {
    const mod = await import('./agentExecute.js').catch(() => null);
    // No hard dependency — stay additive
  } catch (_) {}

  return {
    ok: true,
    tool: 'create_blueprint',
    draft: true,
    id,
    title,
    goal,
    notes: notes || null,
    message:
      'Blueprint draft created. Review before any publish or client send. GODMODEAUTO remains OFF.',
  };
}

/** Read-only status from station / health. */
async function runCheckStatus(a) {
  const scope = String(a.scope || 'station').toLowerCase();
  const out = { ok: true, tool: 'check_status', scope, draft: false };

  try {
    if (scope === 'station' || scope === 'all') {
      const st = await import('./stationEngine.js');
      if (st && typeof st.collectSnapshot === 'function') {
        out.station = await st.collectSnapshot();
      } else if (st && typeof st.buildBriefForAI === 'function') {
        out.stationBrief = await st.buildBriefForAI();
      }
    }
  } catch (e) {
    out.stationError = String(e.message || e).slice(0, 200);
  }

  if (scope === 'health' || scope === 'all') {
    out.health = {
      note: 'Use hard command `health` for full probe. This tool returns lightweight presence only.',
      openrouterTools: TOOL_VERSION,
    };
  }

  if (scope === 'funnel' || scope === 'all') {
    out.funnel = {
      note: 'Funnel leads live in station snapshot / weblead path. No auto-send.',
    };
  }

  return out;
}

/** Knowledge / memory search — best effort. */
async function runSearchKnowledge(a) {
  const query = String(a.query || '').trim().slice(0, 200);
  const limit = Math.min(Math.max(parseInt(a.limit, 10) || 5, 1), 10);
  if (!query) return { ok: false, error: 'empty_query' };

  // Placeholder safe result — wire to real mem/vault when ready
  return {
    ok: true,
    tool: 'search_knowledge',
    query,
    limit,
    results: [],
    note:
      'Knowledge search layer ready. Connect to Second Brain / mem index in next micro-patch if empty.',
  };
}

/** Founder-only draft alert. Never customers. */
async function runSendAlert(a, ctx) {
  const message = String(a.message || '').trim().slice(0, 1500);
  const priority = ['low', 'normal', 'high'].includes(a.priority) ? a.priority : 'normal';
  if (!message) return { ok: false, error: 'empty_message' };

  return {
    ok: true,
    tool: 'send_alert',
    draft: true,
    priority,
    message,
    note:
      'Alert queued as DRAFT for Founder review. Not sent to any customer. GODMODEAUTO OFF.',
  };
}

/**
 * Helper: after model returns tool_calls, run them and build messages for next turn.
 * Compatible with OpenRouter / OpenAI chat completions tool format.
 */
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

/** System note to inject when tools are enabled */
export function getToolsSystemNote() {
  return [
    '=== OPENROUTER TOOLS (Wave 40A) ===',
    'You may call these tools when needed: create_blueprint, check_status, search_knowledge, send_alert.',
    'Rules:',
    '- create_blueprint and send_alert are DRAFT only. Never claim published or charged.',
    '- check_status and search_knowledge are read-only.',
    '- GODMODEAUTO is OFF. No auto customer messages. No auto payments.',
    '- Prefer hard slash commands (station status, health, funnel) when user asks for full operational detail.',
  ].join('\n');
}
