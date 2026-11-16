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
    const corps = Object.entries(s.byCorps || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(' · ');
    return (
      `🧪 *Lab Status · ${s.phase}*\n` +
      `Research: *${s.research}* · Nation map: *${s.nation}*\n` +
      `Gates: *${s.gates}*\n` +
      `Corps: ${corps}`
    );
  }
  if (/^(lab|laboratory)\s+mandate$/i.test(lower)) {
    return '*Lab Mandate*\n\n' + eng.LAB_MANDATE;
  }
  if (/^(lab|laboratory)\s+research$/i.test(lower)) {
    return eng.formatResearchList();
  }
  if (/^(lab|laboratory)\s+research\s+run$/i.test(lower)) {
    const r = await eng.runResearchPulse();
    const lines = [
      '🔭 *Research pulse*',
      `Web: ${r.webOk ? '✅' : '⚠️ offline/fallback'}${r.provider ? ' · ' + r.provider : ''} · ${r.ms}ms`,
      '',
    ];
    for (const f of r.findings || []) {
      lines.push(`*${f.topic}*`);
      lines.push(String(f.snippet || '').slice(0, 280));
      lines.push('');
    }
    lines.push('_A proposal may have been auto-filed — check `lab proposals`_');
    return lines.join('\n').slice(0, 4000);
  }
  if (/^(lab|laboratory)\s+nation$/i.test(lower)) {
    return eng.formatNation();
  }
  if (/^(lab|laboratory)\s+gates$/i.test(lower)) {
    return eng.formatGates();
  }
  if (/^(lab|laboratory)\s+proposals$/i.test(lower)) {
    const rows = await eng.listProposals({ status: 'proposed', limit: 10 });
    if (!rows.length) return 'No open proposals. `lab propose Title | Summary`';
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
    return `✅ Proposal \`${String(r.proposal.id).slice(0, 8)}\`\n${prop[1].trim()}`;
  }
  if (/^(lab|laboratory)\s+report$/i.test(lower)) {
    const r = await eng.generateDailyReport();
    // Return first chunk; note if more
    const chunks = r.chunks || [r.body];
    let msg = chunks[0];
    if (chunks.length > 1) {
      msg += `\n\n_… ${chunks.length} chunks total. Cron labdaily sends all to Founder DM._`;
    }
    // If ctx available, send remaining chunks
    if (ctx && chunks.length > 1 && ctx.reply) {
      for (let i = 1; i < chunks.length; i++) {
        try {
          await ctx.reply(`(${i + 1}/${chunks.length})\n` + chunks[i]);
        } catch (_) {}
      }
    }
    return msg.slice(0, 4000);
  }
  const impl = raw.match(/^(?:lab|laboratory)\s+implement\s+([a-f0-9-]{8,})$/i);
  if (impl) {
    const rows = await eng.listProposals({ status: 'all', limit: 50 });
    const id = impl[1].toLowerCase();
    const p = rows.find((x) => String(x.id).startsWith(id));
    if (!p) return 'Proposal not found. Use `lab proposals`.';
    return eng.formatImplementChecklist(eng.implementChecklist(p));
  }

  const adopt = raw.match(/^(?:lab|laboratory)\s+adopt\s+([a-f0-9-]{8,})$/i);
  if (adopt) {
    const r = await eng.setProposalStatus(adopt[1], 'approved');
    if (!r.ok) return '❌ ' + (r.error || 'adopt failed');
    return (
      `✅ Approved \`${String(r.proposal.id).slice(0, 8)}\`\n${r.proposal.title}\n` +
      '_Next: send proposal text to Grok for ZIP_'
    );
  }
  return '❓ Try `lab help`';
}

export default { tryHandle, isLabText };
