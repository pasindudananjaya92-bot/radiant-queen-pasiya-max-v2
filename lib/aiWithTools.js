/**
 * Wave 40B — OpenRouter chat with tool loop (one extra turn max)
 * Drop-in helper for the emergency OpenRouter path in api/telegram.js
 * GODMODEAUTO OFF. Draft-safe tools only.
 */
import {
  OPENROUTER_TOOLS,
  runToolCallsFromMessage,
  getToolsSystemNote,
} from './openRouterTools.js';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

function orHeaders(apiKey) {
  return {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_URL || 'https://radiant-queen-pasiya-max-v2.vercel.app',
    'X-Title': 'Radiant Queen Pasiya Max',
  };
}

/**
 * One OpenRouter call (optionally with tools).
 * @returns {{ text: string, usedTools: boolean, model: string } | null}
 */
async function orCall({ apiKey, model, messages, withTools, temperature, maxTokens }) {
  const body = {
    model,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 1200,
    messages,
  };
  if (withTools) {
    body.tools = OPENROUTER_TOOLS;
    body.tool_choice = 'auto';
  }

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: orHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;

  const msg = data?.choices?.[0]?.message;
  if (!msg) return null;
  return { message: msg, data };
}

/**
 * Chat via OpenRouter with optional one-round tool calling.
 *
 * Usage from telegram.js (replace the plain OpenRouter block):
 *
 *   const { chatWithOpenRouterTools } = await import('../lib/aiWithTools.js');
 *   const out = await chatWithOpenRouterTools({
 *     systemInstruction,
 *     userPrompt,
 *     enableTools: true,
 *   });
 *   if (out?.text) return out.text;
 */
export async function chatWithOpenRouterTools({
  systemInstruction = '',
  userPrompt = '',
  enableTools = true,
  temperature = 0.7,
  maxTokens = 1200,
  models = null,
} = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) return null;

  const modelList =
    models ||
    [
      process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
    ].filter(Boolean);

  const sys =
    String(systemInstruction || '').trim() +
    (enableTools ? '\n\n' + getToolsSystemNote() : '');

  const baseMessages = [
    { role: 'system', content: sys },
    { role: 'user', content: String(userPrompt || '') },
  ];

  for (const model of modelList) {
    try {
      // Turn 1
      const first = await orCall({
        apiKey,
        model,
        messages: baseMessages,
        withTools: enableTools,
        temperature,
        maxTokens,
      });
      if (!first || !first.message) continue;

      const msg = first.message;
      const toolCalls = msg.tool_calls;

      // No tools → plain text
      if (!enableTools || !Array.isArray(toolCalls) || !toolCalls.length) {
        const text = String(msg.content || '').trim();
        if (text) return { text: text.slice(0, 3500), usedTools: false, model };
        continue;
      }

      // Turn 2: run tools, send results back
      const toolMessages = await runToolCallsFromMessage(msg, {});
      const secondMessages = [
        ...baseMessages,
        {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls,
        },
        ...toolMessages,
      ];

      const second = await orCall({
        apiKey,
        model,
        messages: secondMessages,
        withTools: false, // final answer, no more tools
        temperature,
        maxTokens,
      });

      const text = String(
        (second && second.message && second.message.content) || ''
      ).trim();
      if (text) return { text: text.slice(0, 3500), usedTools: true, model };

      // Fallback: summarize tool results if model returned empty
      const fallback =
        'Tools ran (' +
        toolCalls.map((t) => t.function?.name).join(', ') +
        '). Review draft results in station / health if needed.';
      return { text: fallback, usedTools: true, model };
    } catch (_) {
      continue;
    }
  }

  return null;
}

export default { chatWithOpenRouterTools };
