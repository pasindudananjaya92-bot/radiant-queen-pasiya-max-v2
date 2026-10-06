/**
 * lib/flowAI.js — natural language → flow steps
 */
export function flowFromNlPrompt(description) {
  return (
    'Convert this automation into 3-6 flow steps.\n' +
    'Each line MUST be one of:\n' +
    'text: static message\n' +
    'ai: prompt using {{input}} for previous output\n' +
    'http: https://url\n' +
    'notify: message to user\n' +
    'Description: ' +
    String(description || '').slice(0, 500) +
    '\nOutput ONLY the step lines.'
  );
}

export default { flowFromNlPrompt };
