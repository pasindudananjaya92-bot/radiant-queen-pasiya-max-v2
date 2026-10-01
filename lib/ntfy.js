/**
 * lib/ntfy.js — free push via ntfy.sh
 */
export function ntfyTopic(adminId) {
  const fromEnv = process.env.NTFY_TOPIC;
  if (fromEnv) return String(fromEnv).replace(/[^a-zA-Z0-9_-]/g, '');
  return ('radiant-queen-' + String(adminId || 'public')).replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function sendNtfy(title, body, priority, adminId) {
  const topic = ntfyTopic(adminId);
  try {
    const res = await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
      method: 'POST',
      headers: {
        Title: String(title || 'Radiant Queen').slice(0, 120),
        Priority: String(priority || 'default'),
        Tags: 'robot,speech_balloon',
      },
      body: String(body || '').slice(0, 3500),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: 'HTTP ' + res.status + ' ' + t.slice(0, 120), topic };
    }
    return { ok: true, topic };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), topic };
  }
}

export default { ntfyTopic, sendNtfy };
