/**
 * Wave 11B — Council of 5
 * Hobby-safe default: Oracle + Scribe use LLM; Researcher = live tools;
 * Critic = heuristic; Executor = rule-based actions.
 * COUNCIL_FULL=1 enables 5 LLM turns (needs longer timeout / background).
 */

async function callLLM(system, user, budgetMs = 7000) {
  const start = Date.now();
  try {
    const { routeTextAI } = await import('./aiRouter.js');
    const r = await Promise.race([
      routeTextAI({ system, user }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('llm timeout')), budgetMs)),
    ]);
    const text =
      typeof r === 'string'
        ? r
        : r?.text || r?.content || r?.reply || r?.message || JSON.stringify(r).slice(0, 1500);
    return {
      ok: true,
      text: String(text || '').trim().slice(0, 2200),
      ms: Date.now() - start,
      provider: r?.provider || r?.label || 'ai',
    };
  } catch (e) {
    return {
      ok: false,
      text: `LLM error: ${e.message || e}`,
      ms: Date.now() - start,
      provider: 'none',
    };
  }
}

export async function collectOsContext() {
  const parts = [];
  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    if (typeof fn === 'function') {
      const h = await fn();
      const checks = h.checks || h.results || [];
      if (Array.isArray(checks) && checks.length) {
        parts.push(
          '[health]\n' +
            checks
              .slice(0, 10)
              .map(
                (c) =>
                  `${c.ok === false ? 'DOWN' : 'OK'} ${c.name || c.id}${c.ms != null ? ` ${c.ms}ms` : ''}`
              )
              .join('\n')
        );
      } else {
        parts.push('[health]\n' + String(h.summary || JSON.stringify(h)).slice(0, 600));
      }
    }
  } catch (e) {
    parts.push('[health]\nerror: ' + (e.message || e));
  }
  try {
    const al = await import('./dashboardAlerts.js');
    const r = await al.collectLiveAlerts();
    const list = r.alerts || [];
    parts.push(
      list.length
        ? '[alerts]\n' +
            list
              .slice(0, 6)
              .map((a) => `${a.severity || a.level}: ${a.title || a.message}`)
              .join('\n')
        : '[alerts]\nnone'
    );
  } catch (_) {
    parts.push('[alerts]\nn/a');
  }
  try {
    const bank = await import('./bankManager.js');
    const sum = await bank.summary(7);
    parts.push(
      `[bank]\n${sum.formatted || sum.total}` +
        (sum.total_base_formatted ? ` ≈ ${sum.total_base_formatted} (${sum.base_currency})` : '') +
        ` · ${sum.count} txs · fx_live=${!!sum.fx_live}`
    );
  } catch (_) {
    parts.push('[bank]\nn/a');
  }
  try {
    const mc = await import('./missionControl.js');
    const st = await mc.nationStatus();
    parts.push(`[nation]\nroster=${st.roster_count || 0} open_missions=${st.open_missions || 0}`);
  } catch (_) {}
  return parts.join('\n\n').slice(0, 4500);
}

function heuristicCritic(osContext, oracleText) {
  let trust = 72;
  const downs = (osContext.match(/\bDOWN\b/g) || []).length;
  if (downs > 0) trust -= downs * 12;
  if (/error:|n\/a/i.test(osContext)) trust -= 5;
  if (!oracleText || oracleText.length < 40) trust -= 10;
  if (/LLM error|timeout/i.test(oracleText || '')) trust -= 15;
  trust = Math.max(15, Math.min(95, trust));
  const lines = [
    `Trust score: ${trust}/100`,
    downs ? `⚠ ${downs} health surface(s) DOWN — do not claim "all green".` : '✓ No DOWN markers in health context.',
    'Demand: every claim must map to [health]/[bank]/[alerts]/[nation] tags.',
    trust >= 60 ? 'Verdict: acceptable for Founder action list.' : 'Verdict: LOW — investigate before action.',
  ];
  return { ok: true, text: lines.join('\n'), ms: 0, provider: 'heuristic', trust };
}

function ruleExecutor(osContext, trust) {
  const actions = [];
  if (/\bDOWN\b/.test(osContext)) {
    actions.push('1. health — re-check down surfaces (auto-safe)');
    actions.push('2. alerts — open Alert Center (auto-safe)');
  } else {
    actions.push('1. health — confirm still green (auto-safe)');
  }
  actions.push('2. nation status — roster/missions pulse (auto-safe)');
  actions.push('3. morning pack — optional briefing (auto-safe)');
  if (trust < 60) actions.push('4. mission create follow-up audit (needs-founder)');
  else actions.push('4. No emergency action required (auto-safe)');
  return {
    ok: true,
    text: actions.join('\n'),
    ms: 0,
    provider: 'rules',
  };
}

/**
 * @param {{ title: string, goal?: string, full?: boolean }} opts
 */
export async function runCouncilDebate({ title, goal, full = false } = {}) {
  const t0 = Date.now();
  const osContext = await collectOsContext();
  const turns = [];
  const useFull = full || String(process.env.COUNCIL_FULL || '0') === '1';

  // ORACLE (LLM)
  const oracle = await callLLM(
    'You are ORACLE-01, planner for Queen Sovereign OS. Concise bullets only: restated goal, 3 success criteria, 3 risks, focus order for corps. No fluff.',
    `TITLE: ${title}\nGOAL: ${goal || title}\n\nOS CONTEXT:\n${osContext}`,
    useFull ? 8000 : 6500
  );
  turns.push({
    corps: 'oracle',
    code: 'ORACLE-01',
    title: 'Frame mission',
    ...oracle,
  });

  // RESEARCHER (tools only — no LLM in fast mode)
  let researcher;
  if (useFull) {
    researcher = await callLLM(
      'You are RESEARCH-01. Use only OS context. Tag every bullet [health]|[bank]|[alerts]|[nation]. No invention.',
      `GOAL: ${goal || title}\n\nCONTEXT:\n${osContext}\n\nORACLE:\n${oracle.text}`,
      7000
    );
  } else {
    researcher = {
      ok: true,
      text:
        'Evidence pack (live tools):\n' +
        osContext +
        '\n\nNote: Fast council uses tool evidence directly; full LLM research when COUNCIL_FULL=1.',
      ms: 0,
      provider: 'tools',
    };
  }
  turns.push({
    corps: 'researcher',
    code: 'RESEARCH-01',
    title: 'Gather evidence',
    ...researcher,
  });

  // CRITIC
  let critic;
  if (useFull) {
    critic = await callLLM(
      'You are CRITIC-01. Attack weak claims. End with Trust score: N/100.',
      `ORACLE:\n${oracle.text}\n\nRESEARCH:\n${researcher.text}`,
      7000
    );
  } else {
    critic = heuristicCritic(osContext, oracle.text);
  }
  turns.push({
    corps: 'critic',
    code: 'CRITIC-01',
    title: 'Attack weak claims',
    ...critic,
  });

  const trust =
    critic.trust != null
      ? critic.trust
      : (() => {
          const m = String(critic.text || '').match(/Trust score:\s*([0-9]{1,3})/i);
          return m ? Number(m[1]) : 55;
        })();

  // EXECUTOR
  let executor;
  if (useFull) {
    executor = await callLLM(
      'You are EXEC-01. Max 5 safe bot actions (health, alerts, nation, morning pack, mission). Label auto-safe | needs-founder.',
      `TRUST:${trust}\nCONTEXT:\n${osContext}\nORACLE:\n${oracle.text}`,
      6000
    );
  } else {
    executor = ruleExecutor(osContext, trust);
  }
  turns.push({
    corps: 'executor',
    code: 'EXEC-01',
    title: 'Propose actions',
    ...executor,
  });

  // SCRIBE (LLM)
  const scribe = await callLLM(
    'You are SCRIBE-01. Final Founder briefing. Sections: Verdict, Evidence, Risks, Actions, System upgrade ideas (how the agent nation should improve). Max 350 words. Clear English.',
    [
      `TITLE: ${title}`,
      `TRUST: ${trust}/100`,
      `ORACLE:\n${oracle.text}`,
      `RESEARCH:\n${String(researcher.text).slice(0, 1200)}`,
      `CRITIC:\n${critic.text}`,
      `EXECUTOR:\n${executor.text}`,
    ].join('\n\n'),
    useFull ? 8000 : 6500
  );
  turns.push({
    corps: 'scribe',
    code: 'SCRIBE-01',
    title: 'Seal report',
    ...scribe,
  });

  const report = [
    `👑 *Council of 5 · Wave 11B*${useFull ? ' (FULL LLM)' : ' (Hobby-fast)'}`,
    `Mission: ${title}`,
    `Trust: ${trust}/100 · ${Date.now() - t0}ms`,
    '',
    `*Final (Scribe)*\n${scribe.text}`,
    '',
    '---',
    '*Turns*',
    ...turns.map(
      (t) =>
        `*${t.code}* [${t.provider} · ${t.ms}ms]\n${String(t.text || '').slice(0, 550)}`
    ),
  ].join('\n');

  return {
    ok: true,
    turns,
    report: report.slice(0, 8000),
    trustHint: trust,
    osContext,
    ms: Date.now() - t0,
    mode: useFull ? 'full' : 'fast',
  };
}

export function councilTaskTemplates() {
  return [
    { corps: 'oracle', title: 'Frame the mission and success criteria' },
    { corps: 'researcher', title: 'Gather evidence from context' },
    { corps: 'critic', title: 'Attack weak claims' },
    { corps: 'executor', title: 'Propose safe executable actions' },
    { corps: 'scribe', title: 'Seal Founder report' },
  ];
}

export default { runCouncilDebate, collectOsContext, councilTaskTemplates };
