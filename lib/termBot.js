/**
 * Optional bot-side terminal session helpers (cwd in settings)
 * Used if you wire /term into telegram.js later.
 */
export function termHelpText() {
  return (
    '⌨ TERMINAL VFS\n' +
    'Open full UI: /desktop → Terminal\n\n' +
    'Commands: ls cd pwd cat mkdir rm touch echo tree df help\n' +
    'Bot: /term ls\n/term cd /Documents\n/term cat Welcome.txt'
  );
}
export default { termHelpText };
