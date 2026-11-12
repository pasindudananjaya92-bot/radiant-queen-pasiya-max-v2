// Queen Mail — Resend API (enqueue-friendly, <3s)
const RESEND_URL = 'https://api.resend.com/emails';

function founderEmail() {
  return process.env.FOUNDER_EMAIL || process.env.MAIL_TO || '';
}

function fromAddress() {
  return process.env.RESEND_FROM || process.env.MAIL_FROM || 'Queen OS <onboarding@resend.dev>';
}

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, text, html } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY not set in Vercel' };
  }
  const dest = String(to || founderEmail() || '').trim();
  if (!dest) {
    return { ok: false, error: 'No recipient. Set FOUNDER_EMAIL or pass to=' };
  }
  const sub = String(subject || 'Queen OS Report').slice(0, 200);
  const bodyText = String(text || '').slice(0, 20000);
  const bodyHtml = html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(bodyText)}</pre>`;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [dest],
      subject: sub,
      text: bodyText,
      html: bodyHtml,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: j?.message || j?.error || `Resend ${res.status}` };
  }
  return { ok: true, id: j.id, to: dest, subject: sub };
}

export async function sendShadowOrHealthReport(kind = 'status', bodyText = '') {
  const subject =
    kind === 'shadow'
      ? 'Queen OS — Shadow / Morning Report'
      : kind === 'health'
        ? 'Queen OS — Health Report'
        : 'Queen OS — Report';
  return sendEmail({ subject, text: bodyText || 'Empty report.' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
