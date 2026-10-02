/**
 * lib/referral.js — invite friends, earn Radiant Gold
 * Table: rq_referrals
 */
export const REF_BONUS_REFERRER = 50;
export const REF_BONUS_REFERRED = 25;

export function refStartLink(botUsername, userId) {
  const u = String(botUsername || 'PasiyaMaxQueen_bot').replace(/^@/, '');
  return 'https://t.me/' + u + '?start=ref_' + String(userId);
}

export async function applyReferral(supabase, { referrerId, referredId, setGold, getOrCreateGold }) {
  const rid = Number(referrerId);
  const newId = Number(referredId);
  if (!supabase || !Number.isFinite(rid) || !Number.isFinite(newId)) {
    return { ok: false, error: 'bad_ids' };
  }
  if (rid === newId) return { ok: false, error: 'self' };

  // already referred?
  const { data: existing } = await supabase
    .from('rq_referrals')
    .select('id')
    .eq('referred_id', newId)
    .maybeSingle();
  if (existing) return { ok: false, error: 'already' };

  const { error: insErr } = await supabase.from('rq_referrals').insert({
    referrer_id: rid,
    referred_id: newId,
    bonus_referrer: REF_BONUS_REFERRER,
    bonus_referred: REF_BONUS_REFERRED,
  });
  if (insErr) return { ok: false, error: insErr.message };

  // credit referrer
  const refG = await getOrCreateGold(rid, null);
  if (refG.ok) {
    await setGold(rid, Number(refG.gold || 0) + REF_BONUS_REFERRER);
  }
  // credit new user extra
  const newG = await getOrCreateGold(newId, null);
  if (newG.ok) {
    await setGold(newId, Number(newG.gold || 0) + REF_BONUS_REFERRED);
  }

  return {
    ok: true,
    referrerBonus: REF_BONUS_REFERRER,
    referredBonus: REF_BONUS_REFERRED,
  };
}

export async function referralStats(supabase, userId) {
  const uid = Number(userId);
  if (!supabase || !Number.isFinite(uid)) return { count: 0, earned: 0 };
  const { data, error } = await supabase
    .from('rq_referrals')
    .select('bonus_referrer')
    .eq('referrer_id', uid);
  if (error || !data) return { count: 0, earned: 0 };
  const earned = data.reduce((s, r) => s + (Number(r.bonus_referrer) || 0), 0);
  return { count: data.length, earned };
}
