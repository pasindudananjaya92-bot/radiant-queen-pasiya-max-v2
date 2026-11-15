function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isLabText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(lab|laboratory|researchnet)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isLabText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./labEngine.js');
  const lower = raw.toLowerCase();

  if (/^(lab|laboratory)\s+help$/i.test(lower) || /^(lab|laboratory)$/i.test(lower)) {
    return eng.labHelp();
  }
  if (/^(lab|laboratory)\s+status$/i.test(lower)) {
    const s = eng.labStatus();
    return (
      `🧪 *Lab Status · ${s.phase}*\n` +
      `Research Net: *${s.research}*\n` +
      `Mandate: active\n` +
      `Proposals DB: ready (run SQL if empty lists)`
    );
  }
  if (/^(lab|laboratory)\s+mandate$/i.test(lower)) {
    return '*Lab Mandate*\n\n' + eng.LAB_MANDATE;
  }
  if (/^(lab|laboratory)\s+research$/i.test(lower)) {
    return eng.formatResearchList();
  }
  if (/^(lab|laboratory)\s+proposals$/i.test(lower)) {
    const rows = await eng.listProposals({ status: 'proposed', limit: 10 });
    if (!rows.length) return 'No open proposals. File one: `lab propose Title | Summary`';
    return (
      '📋 *Lab proposals*\n\n' +
      rows
        .map(
          (p, i) =>
            `${i + 1}. \`${String(p.id).slice(0, 8)}\` *${String(p.title).slice(0, 60)}*\n${String(p.summary || '').slice(0, 120)}`
        )
        .join('\n\n')
    );
  }
  const prop = raw.match(/^(?:lab|laboratory)\s+propose\s+(.+?)\s*\|\s*([\s\S]+)$/i);
  if (prop) {
    const r = await eng.createProposal({ title: prop[1].trim(), summary: prop[2].trim() });
    if (!r.ok) return '❌ ' + (r.error || 'failed');
    const id = r.proposal?.id ? String(r.proposal.id).slice(0, 8) : 'ok';
    return `✅ Proposal filed \`${id}\`\n${prop[1].trim()}\n_Use lab adopt ${id} after Founder/Grok review_`;
  }
  if (/^(lab|laboratory)\s+report$/i.test(lower)) {
    const r = await eng.generateDailyReport();
    return r.body.slice(0, 4000);
  }
  const adopt = raw.match(/^(?:lab|laboratory)\s+adopt\s+([a-f0-9-]{8,})$/i);
  if (adopt) {
    const r = await eng.setProposalStatus(adopt[1], 'approved');
    if (!r.ok) return '❌ ' + (r.error || 'adopt failed');
    return (
      `✅ Proposal approved \`${String(r.proposal.id).slice(0, 8)}\`\n` +
      `${r.proposal.title}\n` +
      '_Next: paste proposal to Grok for safe ZIP → mobile upload → health + qa scan_'
    );
  }
  return '❓ Try `lab help`';
}

export default { tryHandle, isLabText };
