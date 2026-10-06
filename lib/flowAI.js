/**
 * lib/flowAI.js — STRICT flow generation (JSON / line steps)
 * Never conversational; Sinhala+English OK
 */

export function flowFromNlPrompt(description) {
  return (
    'You are a flow compiler. Output ONLY machine-readable steps. No questions. No advice.\n' +
    'Language of user input may be Sinhala or English — still output steps in this format only:\n\n' +
    'http: https://example.com\n' +
    'ai: transform {{input}} into a clean list\n' +
    'text: static text\n' +
    'notify: message\n\n' +
    'OR a pure JSON array:\n' +
    '[{"type":"http","payload":"https://hacker-news.firebaseio.com/v0/topstories.json"},' +
    '{"type":"ai","payload":"From {{input}} take first 5 numeric IDs. For each ID conceptually fetch item title/url. Output numbered title — url list only."},' +
    '{"type":"notify","payload":"HN top stories ready"}]\n\n' +
    'Rules:\n' +
    '- NO markdown fences\n' +
    '- NO Sinhala/English chat\n' +
    '- NO "please provide more details"\n' +
    '- 3 to 6 steps max\n' +
    '- Use {{input}} in ai steps to receive previous output\n\n' +
    'USER REQUEST:\n' +
    String(description || '').slice(0, 600)
  );
}

export function flowRetryPrompt(description) {
  return (
    'OUTPUT ONLY JSON ARRAY OF STEPS. ZERO other text.\n' +
    'Schema: [{"type":"http|ai|text|notify","payload":"..."}]\n' +
    'Request: ' +
    String(description || '').slice(0, 400)
  );
}

/** Extract steps from AI text: JSON array OR line format */
export function extractFlowSteps(aiText) {
  const raw = String(aiText || '').trim();
  // strip fences
  let t = raw.replace(/^```(?:json|JSON)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // try JSON array
  const jsonMatch = t.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        const steps = [];
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue;
          const type = String(item.type || '').toLowerCase();
          if (!['http', 'ai', 'text', 'notify'].includes(type)) continue;
          const payload = String(
            item.payload ?? item.url ?? item.prompt ?? item.message ?? item.to ?? ''
          ).trim();
          if (!payload && type !== 'notify') continue;
          steps.push({ type, payload: payload || 'notify' });
        }
        if (steps.length) return steps;
      }
    } catch (_) {}
  }

  // line format
  const steps = [];
  for (const line of t.split(/\n/)) {
    const m = line.trim().match(/^(ai|text|http|notify)\s*[:：]\s*(.+)$/i);
    if (m) steps.push({ type: m[1].toLowerCase(), payload: m[2].trim() });
  }
  if (steps.length) return steps;

  // conversational / clarification → empty (caller retries)
  return [];
}

export default { flowFromNlPrompt, flowRetryPrompt, extractFlowSteps };
