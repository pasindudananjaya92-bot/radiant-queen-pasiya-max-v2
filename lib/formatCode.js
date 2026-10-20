/**
 * Telegram HTML code blocks (one-tap copy on clients that support it)
 */
export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatCodeBlock(code, lang = '') {
  const body = escapeHtml(String(code || '')).slice(0, 3500);
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
  return `<pre><code${cls}>${body}</code></pre>`;
}

export function codeReplyOpts() {
  return { parse_mode: 'HTML', disable_web_page_preview: true };
}

export default { escapeHtml, formatCodeBlock, codeReplyOpts };
