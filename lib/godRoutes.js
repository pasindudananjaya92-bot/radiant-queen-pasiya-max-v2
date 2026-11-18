/**
 * GOD routes · Wave 26B
 * Twin, Empire, Deal, Swarm, Web Guidance, Presets
 */
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
  return (
    /^(god|twin|empire|deal|gswarm|unit|web|preset|inbox)\b/i.test(t) ||
    /^(swarm\s+spawn|swarm\s+units)\b/i.test(t)
  );
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

  if (/^(god|twin|empire)\s+help$/i.test(lower) || /^god$/i.test(lower) || /^twin\s+help$/i.test(lower)) {
    return twin.twinHelp();
  }

  // --- Web Guidance ---
  if (/^web(\s+help)?$/i.test(lower)) {
    const wg = await import('./webGuidance.js');
    return wg.webHelp();
  }
  if (/^web\s+guide\s+list$/i.test(lower) || /^web\s+list$/i.test(lower)) {
    const wg = await import('./webGuidance.js');
    return wg.formatGuideList();
  }
  if (/^web\s+baseline$/i.test(lower)) {
    const wg = await import('./webGuidance.js');
    return wg.formatBaseline();
  }
  if (/^web\s+check$/i.test(lower)) {
    const wg = await import('./webGuidance.js');
    return wg.webCheckDashboard();
  }
  const wgTopic = raw.match(/^web\s+guide\s+(.+)$/i);
  if (wgTopic) {
    const wg = await import('./webGuidance.js');
    const g = wg.getGuide(wgTopic[1].trim());
    return wg.formatGuide(g);
  }

  // --- Presets ---
  if (/^preset(\s+help)?$/i.test(lower)) {
    const pm = await import('./presetManager.js');
    return pm.presetHelp();
  }
  if (/^preset\s+list$/i.test(lower)) {
    const pm = await import('./presetManager.js');
    return pm.formatPresetList(await pm.listPresets());
  }
  const pshow = raw.match(/^preset\s+show\s+(\S+)/i);
  if (pshow) {
    const pm = await import('./presetManager.js');
    return pm.formatPresetShow(await pm.getPreset(pshow[1]));
  }
  // preset set name key value (value may have spaces)
  const pset = raw.match(/^preset\s+set\s+(\S+)\s+(\S+)\s+([\s\S]+)$/i);
  if (pset) {
    const pm = await import('./presetManager.js');
    const r = await pm.setPresetValue(pset[1], pset[2], pset[3].trim().replace(/^["']|["']$/g, ''));
    return r.ok ? `✅ Preset *${r.name}* · *${r.key}* updated` : '❌ ' + (r.error || 'fail');
  }
  // alias: preset set twin tone x → queen-twin
  const pset2 = raw.match(/^preset\s+set\s+twin\s+(\S+)\s+([\s\S]+)$/i);
  if (pset2) {
    const pm = await import('./presetManager.js');
    const r = await pm.setPresetValue('queen-twin', pset2[1], pset2[2].trim().replace(/^["']|["']$/g, ''));
    return r.ok ? `✅ Preset *queen-twin* · *${r.key}* updated` : '❌ ' + (r.error || 'fail');
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
    const r = await twin.setDraftStatus(ap[1], 'approved');
    return r.ok ? '✅ Approved `' + String(r.id).slice(0, 8) + '` _(still not auto-sent)_' : '❌ ' + (r.error || 'fail');
  }
  const rj = raw.match(/^twin\s+reject\s+([a-f0-9-]{8,})$/i);
  if (rj) {
    const r = await twin.setDraftStatus(rj[1], 'rejected');
    return r.ok ? '🗑 Rejected `' + String(r.id).slice(0, 8) + '`' : '❌ ' + (r.error || 'fail');
  }

  // Empire
  if (/^empire\s+status$/i.test(lower)) {
    return emp.formatEmpireStatus(await emp.empireStatus());
  }
  if (/^empire\s+bank$/i.test(lower)) {
    const sum = await emp.bankSummary();
    return emp.formatBankPretty(sum);
  }
  if (/^empire\s+help$/i.test(lower)) return emp.empireHelp();
  const inv = raw.match(/^empire\s+invoice\s+([^|]+)\|([^|]+)\|([\s\S]+)$/i);
  if (inv) {
    const r = await emp.createInvoiceDraft({
      client_name: inv[1].trim(),
      amount: inv[2].trim(),
      description: inv[3].trim(),
    });
    if (!r.ok && r.error) return '❌ ' + r.error;
    const id = r.invoice?.id ? String(r.invoice.id).slice(0, 8) : '—';
    return '📄 Invoice *draft* `' + id + '` · not sent (Stripe later)';
  }
  if (/^empire\s+invoices$/i.test(lower)) {
    return emp.formatInvoices(await emp.listInvoices(10));
  }

  // Inbox alias
  if (/^inbox\s+list$/i.test(lower)) {
    return twin.formatDrafts(await twin.listDrafts({ status: 'pending', limit: 15 }));
  }
  const inb = raw.match(/^inbox\s+ask\s*\|\s*([\s\S]+)$/i) || raw.match(/^inbox\s+ask\s+([\s\S]+)$/i);
  if (inb) {
    const r = await twin.createDraft({ inbound: inb[1].trim(), channel: 'inbox', from_label: 'customer' });
    return (
      '📥 *Inbox draft*' +
      (r.id ? ' `' + String(r.id).slice(0, 8) + '`' : '') +
      '\n\n' +
      String(r.draft || '').slice(0, 1800)
    );
  }

  // Deal Desk 22A + web checklist
  const dealm = raw.match(/^deal\s+create\s+([^|]+)\|([^|]+)\|([^|]+)\|([\s\S]+)$/i);
  if (dealm || /^deal\s+create\s+/i.test(raw)) {
    if (!dealm) return 'Usage: `deal create Client | 500 | Setup week | Their message`';
    const client = dealm[1].trim();
    const amount = dealm[2].trim();
    const desc = dealm[3].trim();
    const inbound = dealm[4].trim();
    const invR = await emp.createInvoiceDraft({ client_name: client, amount, description: desc });
    const dr = await twin.createDraft({ inbound, from_label: client, channel: 'deal' });
    let webBlock = '';
    if (/web|dashboard|website|site|landing|ui/i.test(desc + ' ' + inbound)) {
      try {
        const wg = await import('./webGuidance.js');
        webBlock = '\n\n' + wg.dealWebChecklist();
      } catch (_) {}
    }
    
    let decideBlock = '';
    try {
      const dec = await import('./decisionsEngine.js');
      const risk = await dec.checkText(
        'Client: ' + client + ' Amount: ' + amount + ' Desc: ' + desc + ' Message: ' + inbound
      );
      if (risk.ok && risk.answers) {
        const a = risk.answers;
        const n = (x) => (x && Number(x.noul) >= 0.5 ? 'YES' : 'NO');
        decideBlock =
          '\n\n⚖ *Decide gate*\n' +
          '· money_risk: ' + n(a.money_risk) +
          ' · needs_founder: ' + n(a.needs_founder) +
          ' · urgent: ' + n(a.urgent) +
          '\n_Draft only — no auto charge._';
      } else if (risk.fallback && risk.text) {
        decideBlock = '\n\n⚖ *Decide gate (fallback)*\n' + String(risk.text).slice(0, 400);
      }
    } catch (_) {}

    const invId = invR.invoice?.id ? String(invR.invoice.id).slice(0, 8) : '—';
    const drId = dr.id ? String(dr.id).slice(0, 8) : '—';
    return (
      '💼 *Deal Desk · 28A*\n' +
      'Client: *' +
      client +
      '*\n' +
      'Invoice draft: `' +
      invId +
      '` · ' +
      amount +
      '\n' +
      'Twin draft: `' +
      drId +
      '`\n\n' +
      String(dr.draft || '').slice(0, 1000) +
      webBlock +
      decideBlock +
      '\n\n🌐 Site tip: `site sync pricing | Start:Talk · Pro:$' +
      amount +
      ' · Empire:Talk` then `site publish pricing`' +
      '\n\n_Not sent. Approve twin + Stripe later._'
    );
  }
  if (/^deal\s+list$/i.test(lower)) {
    return emp.formatInvoices(await emp.listInvoices(10));
  }

  // Swarm metadata — MUST stay in GOD routes (21B fix)
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
