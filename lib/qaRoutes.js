function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isQaText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(qa|legion)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isQaText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./qaEngine.js');
  const lower = raw.toLowerCase();

  if (/^(qa|legion)\s+help$/i.test(lower) || /^(qa|legion)$/i.test(lower)) {
    return eng.qaHelp();
  }
  if (/^(qa|legion)\s+legion$/i.test(lower) || /^qa\s+roster$/i.test(lower)) {
    return eng.formatLegion();
  }
  if (/^(qa|legion)\s+status$/i.test(lower)) {
    const open = await eng.listTickets({ status: 'open', limit: 20 });
    const leg = eng.legionSummary();
    return (
      `⚔ *QA Status*\n` +
      `Legion: ${leg.total} agents · ${leg.wings} wings\n` +
      `Open tickets: *${open.length}*\n` +
      (open.length
        ? open
            .slice(0, 5)
            .map((t, i) => `${i + 1}. [${t.severity}] ${t.wing} — ${String(t.title || '').slice(0, 40)}`)
            .join('\n')
        : '_No open tickets_')
    );
  }
  if (/^(qa|legion)\s+scan$/i.test(lower)) {
    const r = await eng.runQaScan();
    if (r.clean) {
      return `⚔ *QA Scan* · ${r.ms}ms\n✅ Clean — no findings. Legion standing by.`;
    }
    return (
      `⚔ *QA Scan* · ${r.ms}ms\n` +
      `Findings: *${r.findings}* · Tickets: *${r.tickets_opened}*\n` +
      (r.tickets || [])
        .slice(0, 5)
        .map((t) => `· [${t.severity}] ${t.wing} — ${String(t.title || '').slice(0, 50)}\n  \`${String(t.id).slice(0, 8)}\``)
        .join('\n')
    );
  }
  if (/^(qa|legion)\s+last$/i.test(lower)) {
    const rows = await eng.listTickets({ status: 'all', limit: 8 });
    if (!rows.length) return 'No QA tickets yet. Run `qa scan` or wait for 13B auto-open.';
    return (
      '⚔ *Recent QA tickets*\n\n' +
      rows
        .map((t, i) => {
          const st = t.status === 'open' ? '🟡' : '✅';
          const plan = eng.suggestPlaybook({ wing: t.wing, title: t.title, detail: t.detail });
          return `${i + 1}. ${st} *${t.wing}* [${t.severity}]\n${String(t.title || '').slice(0, 60)}\n\`${String(t.id).slice(0, 8)}…\` · playbook \`${plan.name}\``;
        })
        .join('\n\n')
    );
  }
  const ticket = raw.match(/^(?:qa|legion)\s+ticket\s+([a-f0-9-]{8,})$/i);
  if (ticket) {
    const rows = await eng.listTickets({ status: 'all', limit: 50 });
    const id = ticket[1].toLowerCase();
    const t = rows.find((x) => String(x.id).startsWith(id)) || (await eng.getTicket(id));
    if (!t) return 'Ticket not found.';
    return (
      `⚔ *Ticket*\n` +
      `ID: \`${t.id}\`\n` +
      `Wing: *${t.wing}* · ${t.severity} · ${t.status}\n` +
      `${t.title}\n\n` +
      `${String(t.detail || '').slice(0, 500)}\n` +
      `Agents: ${(t.assigned_agents || []).join(', ') || '—'}`
    );
  }
  const pb = raw.match(/^(?:qa|legion)\s+playbook\s+([a-f0-9-]{8,})$/i);
  if (pb) {
    const rows = await eng.listTickets({ status: 'all', limit: 50 });
    const id = pb[1].toLowerCase();
    const t = rows.find((x) => String(x.id).startsWith(id)) || (await eng.getTicket(id));
    if (!t) return 'Ticket not found.';
    const plan = eng.suggestPlaybook({
      wing: t.wing,
      title: t.title,
      detail: t.detail,
      severity: t.severity,
    });
    return (
      '⚔ *Ticket playbook*\n' +
      '`' + String(t.id).slice(0, 8) + '` · ' + t.wing + ' · ' + t.status + '\n' +
      String(t.title || '').slice(0, 80) + '\n\n' +
      eng.formatPlaybook(plan)
    );
  }

  const close = raw.match(/^(?:qa|legion)\s+close\s+([a-f0-9-]{8,})$/i);
  if (close) {
    const rows = await eng.listTickets({ status: 'open', limit: 50 });
    const id = close[1].toLowerCase();
    const t = rows.find((x) => String(x.id).startsWith(id));
    if (!t) return 'Open ticket not found (use full/prefix id).';
    const r = await eng.setTicketStatus(t.id, 'closed', 'Closed by Founder');
    if (!r.ok) return '❌ ' + (r.error || 'close failed');
    return `✅ Ticket closed \`${String(t.id).slice(0, 8)}\``;
  }
  return '❓ Try `qa help`';
}

export default { tryHandle, isQaText };
