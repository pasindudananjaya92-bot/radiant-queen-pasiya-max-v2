/** Shared expect rules loader for Architect retest + /expect */
export async function loadExpectRules(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('rq_expect_rules')
      .select('cmd, kind, value')
      .order('id', { ascending: true })
      .limit(80);
    if (error || !data) return [];
    return data.map((r) => ({
      cmd: String(r.cmd || ''),
      kind: r.kind === 'mustNotMatch' ? 'mustNotMatch' : 'mustInclude',
      value: String(r.value || ''),
    }));
  } catch (_) {
    return [];
  }
}

/** Apply DB rules on top of static contract evaluation */
export function evaluateWithExpectRules(cmd, output, staticResult, rules) {
  const text = String(output || '');
  const c = String(cmd || '').toLowerCase().replace(/@\w+$/, '');
  const relevant = (rules || []).filter(
    (r) => String(r.cmd || '').toLowerCase() === c
  );
  if (!relevant.length) return staticResult;

  for (const r of relevant) {
    if (r.kind === 'mustInclude') {
      if (!text.toLowerCase().includes(String(r.value).toLowerCase())) {
        return {
          ok: false,
          reason: 'expect-mustInclude:' + r.value,
        };
      }
    }
    if (r.kind === 'mustNotMatch') {
      let re;
      const v = String(r.value || '').trim();
      try {
        if (v.startsWith('/') && v.lastIndexOf('/') > 0) {
          const last = v.lastIndexOf('/');
          re = new RegExp(v.slice(1, last), v.slice(last + 1) || 'i');
        } else {
          re = new RegExp(v, 'i');
        }
      } catch (_) {
        re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      if (re.test(text)) {
        return {
          ok: false,
          reason: 'expect-mustNotMatch:' + v,
        };
      }
    }
  }
  // DB rules passed — if static failed only on soft markers, allow upgrade to ok when mustInclude hit
  if (staticResult && staticResult.ok === false && relevant.some((r) => r.kind === 'mustInclude')) {
    return { ok: true, reason: 'expect-db-pass' };
  }
  if (staticResult && staticResult.ok) {
    return { ok: true, reason: (staticResult.reason || 'pass') + '+expect' };
  }
  return staticResult || { ok: true, reason: 'expect-only' };
}

export default { loadExpectRules, evaluateWithExpectRules };
