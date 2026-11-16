
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isGodText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(god|twin|empire|deal|gswarm|unit)\b/i.test(t) || /^(swarm\s+spawn|swarm\s+units)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isGodText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const twin = await import('./twinEngine.js');
  const emp = await import('./empireEngine.js');
  const lower = raw.toLowerCase();

  if (/^(god)\s+limits$/i.test(lower) || /^deploy\s+limits$/i.test(lower)) {
    return (
      '*Vercel Hobby limits (guide)*\n' +
      '· ≤100 deployments / day (all pushes count)\n' +
      '· ≤12 serverless functions\n' +
      '· ~10s max duration (use Hull B / OMNI for long)\n' +
      '· Batch ZIP uploads → single redeploy\n' +
      '_Exact remaining count needs Vercel dashboard / token API_'
    );
  }
  if (/^(god|twin|empire)\s+help$/i.test(lower) || /^god$/i.test(lower)) {
    return twin.twinHelp();
  }

  // Twin
  if (/^twin\s+style$/i.test(lower)) {
    return twin.formatStyle(await twin.listStyle());
  }
  const teach = raw.match(/^twin\s+teach\s+([^|]+)\|([\s\S]+)$/i);
  if (teach) {
    const r = await twin.teachStyle(teach[1].trim(), teach[2].trim());
    return r.ok ? '✅ Taught *' + r.key + '*' : '❌ ' + (r.error || 'fail');
  }
  const draft = raw.match(/^twin\s+draft\s+([\s\S]+)$/i);
  if (draft) {
    const r = await twin.createDraft({ inbound: draft[1].trim(), channel: 'telegram' });
    if (!r.ok && r.error) return '❌ ' + r.error;
    return (
      '📝 *Twin draft*' +
      (r.id ? ' `' + String(r.id).slice(0, 8) + '`' : '') +
      '\n\n' +
      String(r.draft || '').slice(0, 1800) +
      '\n\n_Not sent. Approve later when web channel is live._'
    );
  }
  if (/^twin\s+drafts$/i.test(lower)) {
    return twin.formatDrafts(await twin.listDrafts({ status: 'pending', limit: 10 }));
  }
  const ap = raw.match(/^twin\s+approve\s+([a-f0-9-]{8,})$/i);
  if (ap) {
    const rows = await twin.listDrafts({ status: 'all', limit: 30 });
    const row = rows.find((d) => String(d.id).startsWith(ap[1].toLowerCase()));
    if (!row) return 'Draft not found';
    const r = await twin.setDraftStatus(row.id, 'approved');
    return r.ok ? '✅ Draft approved (still not auto-sent)' : '❌ ' + r.error;
  }
  const rj = raw.match(/^twin\s+reject\s+([a-f0-9-]{8,})$/i);
  if (rj) {
    const rows = await twin.listDrafts({ status: 'all', limit: 30 });
    const row = rows.find((d) => String(d.id).startsWith(rj[1].toLowerCase()));
    if (!row) return 'Draft not found';
    const r = await twin.setDraftStatus(row.id, 'rejected');
    return r.ok ? '🗑 Draft rejected' : '❌ ' + r.error;
  }

  // Empire
  if (/^empire\s+status$/i.test(lower)) {
    return emp.formatEmpireStatus(await emp.empireStatus());
  }
  if (/^empire\s+invoices$/i.test(lower)) {
    return emp.formatInvoices(await emp.listInvoices(10));
  }
  if (/^empire\s+bank$/i.test(lower)) {
    const b = await emp.bankSummary();
    return '🏦 *Empire Bank*\n' + JSON.stringify(b).slice(0, 1500);
  }
  const inv = raw.match(/^empire\s+invoice\s+([^|]+)\|([^|]+)\|([\s\S]+)$/i);
  if (inv) {
    const r = await emp.createInvoiceDraft({
      client_name: inv[1].trim(),
      amount: inv[2].trim(),
      description: inv[3].trim(),
    });
    if (!r.ok) return '❌ ' + (r.error || 'fail');
    const id = r.invoice?.id ? String(r.invoice.id).slice(0, 8) : 'draft';
    return '📄 Invoice *draft* `' + id + '` created. Stripe send later + Founder approve.';
  }



  // Wave 22A lite — Support Inbox (web/founder only drafts)
  if (/^inbox\s+help$/i.test(lower) || /^support\s+help$/i.test(lower)) {
    return (
      '*Support Inbox · 22A*\n' +
      '• `inbox ask | <customer message>` — twin draft\n' +
      '• `inbox list` — pending drafts\n' +
      '• `deal create Client | amt | desc | message`\n' +
      '_No auto-send to TG contacts._'
    );
  }
  if (/^inbox\s+list$/i.test(lower)) {
    const twin = await import('./twinEngine.js');
    return twin.formatDrafts(await twin.listDrafts({ status: 'pending', limit: 15 }));
  }
  const inb = raw.match(/^inbox\s+ask\s*\|\s*([\s\S]+)$/i) || raw.match(/^inbox\s+ask\s+([\s\S]+)$/i);
  if (inb) {
    const twin = await import('./twinEngine.js');
    const r = await twin.createDraft({ inbound: inb[1].trim(), channel: 'inbox', from_label: 'customer' });
    return (
      '📥 *Inbox draft*' +
      (r.id ? ' `' + String(r.id).slice(0, 8) + '`' : '') +
      '\n\n' +
      String(r.draft || '').slice(0, 1800)
    );
  }

  // Deal Desk 21B
  const dealm = raw.match(/^deal\s+create\s+([^|]+)\|([^|]+)\|([^|]+)\|([\s\S]+)$/i);
  if (dealm || /^deal\s+create\s+/i.test(raw)) {
    const emp = await import('./empireEngine.js');
    const twin = await import('./twinEngine.js');
    let client, amount, desc, inbound;
    if (dealm) {
      client = dealm[1].trim();
      amount = dealm[2].trim();
      desc = dealm[3].trim();
      inbound = dealm[4].trim();
    } else {
      return 'Usage: `deal create Client | 500 | Setup week | Their message`';
    }
    const inv = await emp.createInvoiceDraft({ client_name: client, amount, description: desc });
    const dr = await twin.createDraft({
      inbound: inbound,
      from_label: client,
      channel: 'deal',
    });
    const invId = inv.invoice?.id ? String(inv.invoice.id).slice(0, 8) : '—';
    const drId = dr.id ? String(dr.id).slice(0, 8) : '—';
    return (
      '💼 *Deal Desk · 21B*\n' +
      'Client: *' + client + '*\n' +
      'Invoice draft: `' + invId + '` · ' + amount + '\n' +
      'Twin draft: `' + drId + '`\n\n' +
      String(dr.draft || '').slice(0, 1200) +
      '\n\n_Not sent. Approve twin + Stripe later._'
    );
  }
  if (/^deal\s+list$/i.test(lower)) {
    const emp = await import('./empireEngine.js');
    return emp.formatInvoices(await emp.listInvoices(10));
  }

  // Swarm metadata
  const sp = raw.match(/^(?:swarm|gswarm|unit)\s+spawn\s+(\w+)(?:\s+(.+))?$/i);
  if (sp) {
    const r = await emp.spawnUnit(sp[1], sp[2] || '');
    return r.ok
      ? '🐝 Spawned *' + (r.unit?.role || sp[1]) + '* unit `' + String(r.unit?.id || '').slice(0, 8) + '`'
      : '❌ ' + (r.error || 'fail');
  }
  if (/^(?:swarm|gswarm)\s+units$/i.test(lower) || /^unit\s+list$/i.test(lower)) {
    return emp.formatUnits(await emp.listUnits(20));
  }

  return '❓ Try `god help`';
}

export default { tryHandle, isGodText };
